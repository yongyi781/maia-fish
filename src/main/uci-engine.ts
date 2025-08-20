import { type ChildProcessWithoutNullStreams, spawn } from "child_process"
import { EventEmitter } from "events"
import type { EngineState, UciBestMove, UciInfo, UciMoveInfo, UciOption } from "../shared"
import readline from "readline"

/** Parse a single UCI "info" line into a UciInfo object.  */
function parseUciMoveInfo(line: string) {
  const tokens = line.trim().split(/\s+/)
  if (tokens.shift() !== "info") {
    throw new Error("Not a UCI info line")
  }

  const info: UciMoveInfo = {}
  let i = 0
  while (i < tokens.length) {
    const key = tokens[i++]
    switch (key) {
      case "depth":
        info.depth = parseInt(tokens[i++], 10)
        break
      case "seldepth":
        info.seldepth = parseInt(tokens[i++], 10)
        break
      case "multipv":
        info.multipv = parseInt(tokens[i++], 10)
        break
      case "score":
        {
          const kind = tokens[i++]
          const value = parseInt(tokens[i++], 10)
          if (kind === "cp" || kind === "mate") {
            info.score = { type: kind, value }
          } else {
            throw new Error(`Unknown score kind: ${kind}`)
          }
          // optional bound flag
          if (tokens[i] === "lowerbound" || tokens[i] === "upperbound") {
            info.score.bound = tokens[i] === "lowerbound" ? "lower" : "upper"
            i++
          }
        }
        break
      case "upperbound":
        info.upperbound = parseInt(tokens[i++], 10)
        break
      case "lowerbound":
        info.lowerbound = parseInt(tokens[i++], 10)
        break
      case "nodes":
        info.nodes = parseInt(tokens[i++], 10)
        break
      case "nps":
        info.nps = parseInt(tokens[i++], 10)
        break
      case "hashfull":
        info.hashfull = parseInt(tokens[i++], 10)
        break
      case "tbhits":
        info.tbhits = parseInt(tokens[i++], 10)
        break
      case "time":
        info.time = parseInt(tokens[i++], 10)
        break
      case "currmove":
        info.currmove = tokens[i++]
        break
      case "currmovenumber":
        info.currmovenumber = parseInt(tokens[i++], 10)
        break
      case "pv":
        // everything after "pv" are the moves
        info.pv = tokens.slice(i)
        i = tokens.length
        break
      default:
        // unknown key: read next token as its value
        console.warn(`Unknown key (${key}) => ${info[key]} (line: ${line})`)
        info[key] = tokens[i++]
        break
    }
  }

  return info
}

function parseBestMove(line: string) {
  const m = line.match(/^bestmove\s+(\S+)(?:\s+ponder\s+(\S+))?/)
  if (!m) throw new Error(`Failed to parse bestmove line: ${line}`)
  return { bestmove: m[1], ponder: m[2] } as UciBestMove
}

/** Interface to a UCI engine. */
export class UciEngine extends EventEmitter {
  #state: EngineState = "unloaded"
  private pendingPosition: string | undefined
  private pendingDepth: number = 0
  private process: ChildProcessWithoutNullStreams | null = null
  private rl: readline.Interface | null = null

  constructor(private defaultTimeoutMs = 5000) {
    super()
  }

  get state() {
    return this.#state
  }

  set state(state: EngineState) {
    if (state !== this.#state) {
      this.#state = state
      console.log("\x1b[32mEngine state:", state, "\x1b[0m")
      this.emit("stateChange", state)
    }
  }

  start(enginePath: string) {
    this.kill()
    this.process = spawn(enginePath)
    this.rl = readline.createInterface({
      input: this.process.stdout,
      crlfDelay: Infinity
    })
    this.rl.on("line", (line: string) => {
      this.handleLine(line)
    })

    this.process.stderr.on("data", (data: Buffer) => {
      const error = data.toString()
      console.warn("Engine Error:", error)
    })

    this.process.on("error", (err: Error) => {
      throw err
    })

    return this.uci()
  }

  /** Kills the existing engine, if any. */
  kill(): void {
    this.rl?.close()
    this.process?.kill()
    this.process = null
    this.state = "unloaded"
  }

  /** uci: returns parsed { name, author, options } */
  async uci(timeoutMs = this.defaultTimeoutMs) {
    let name: string | undefined
    let author: string | undefined
    const options: UciOption[] = []

    // collect option lines until uciok
    await this.sendAndWaitFor(
      "uci",
      (line) => line === "uciok",
      timeoutMs,
      (line) => {
        if (line.startsWith("id name ")) {
          name = line.substring(8)
        } else if (line.startsWith("id author ")) {
          author = line.substring(10)
        } else if (line.startsWith("option ")) {
          // use regex to parse option lines; name may contain spaces
          // sample: option name Hash type spin default 16 min 1 max 1024
          const m = line.match(
            /^option\s+name\s+(.*?)\s+type\s+(\S+)(?:\s+default\s+(\S+))?(?:\s+min\s+(\S+))?(?:\s+max\s+(\S+))?$/i
          )
          if (m) {
            const [, optName, optType, optDefault, optMin, optMax] = m
            options.push({
              name: optName,
              type: optType as UciOption["type"],
              default: optDefault,
              min: optMin ? parseInt(optMin, 10) : undefined,
              max: optMax ? parseInt(optMax, 10) : undefined
            })
            // emit parsed option event as well
          } else {
            // fallback: keep the raw line
            console.warn("warning", `Unparsable option line: ${line}`)
          }
        }
      }
    )
    this.state = "idle"
    return { name, author, options } as UciInfo
  }

  /** Unblocks when the engine is ready. */
  async isready() {
    this.send("isready")
    return new Promise<void>((resolve) => this.once("readyok", resolve))
  }

  async newGame() {
    // Not optional, engine breaks if we call "ucinewgame" while it is running.
    if (this.state === "running") await this.stop()
    this.send("ucinewgame")
    return this.isready()
  }

  setOption(name: string, value: number | string) {
    if (this.state !== "idle") throw new Error("Called setOption while engine is not in the stopped state.")
    this.send(`setoption name ${name} value ${value}`)
  }

  /** Sends "go", and returns a promise that waits for "bestmove" if depth > 0. */
  go(depth = 0) {
    switch (this.state) {
      case "idle":
        this.state = "running"
        this.sendPendingPosition()
        this.send(`go ${depth ? `depth ${depth}` : "infinite"}`)
        this.pendingDepth = 0
        break
      case "running":
        console.warn("Called go while engine is already running.")
        return Promise.resolve(undefined)
      case "waitingBestMoveToIdle":
      case "waitingBestMoveToRun":
        this.state = "waitingBestMoveToRun"
        this.pendingDepth = depth
        break
      default:
        break
    }
    return depth
      ? new Promise<UciBestMove | undefined>((resolve) => this.once("bestmove", resolve))
      : Promise.resolve(undefined)
  }

  /** Sends "stop", and returns a promise that waits for "bestmove". */
  stop() {
    switch (this.state) {
      case "running":
        this.state = "waitingBestMoveToIdle"
        this.send("stop")
        break
      case "waitingBestMoveToRun":
        this.state = "waitingBestMoveToIdle"
        break
      default:
        break
    }
    return this.waitBestMovePromise()
  }

  /** Changes the position. Waits for "bestmove" if applicable. */
  position(str: string) {
    this.pendingPosition = str
    switch (this.state) {
      case "waitingBestMoveToIdle":
        this.state = "waitingBestMoveToRun"
        break
      case "running":
        this.send("stop")
        this.state = "waitingBestMoveToRun"
        break
      default:
        break
    }
    return this.waitBestMovePromise()
  }

  /** Sends a command. Returns immediately. */
  private send(command: string) {
    if (!this.process) throw new Error("Engine process not running.")
    console.log("SF command:", command)
    this.process.stdin.write(`${command}\n`)
  }

  /** If waiting for best move, returns a promise that waits for "bestmove". Otherwise, returns a resolved promise. */
  private waitBestMovePromise() {
    return this.state === "waitingBestMoveToIdle" || this.state === "waitingBestMoveToRun"
      ? new Promise<UciBestMove | undefined>((resolve) => this.once("bestmove", resolve))
      : Promise.resolve(undefined)
  }

  /** State change on receiving "bestmove". */
  private handleBestMove() {
    switch (this.state) {
      case "idle":
        throw new Error("handleBestMove: Should not be in state idle.")
      case "running":
      case "waitingBestMoveToIdle":
        this.state = "idle"
        this.pendingDepth = 0
        this.pendingPosition = undefined
        break
      case "waitingBestMoveToRun":
        this.state = "running"
        this.sendPendingPosition()
        this.send(`go ${this.pendingDepth ? `depth ${this.pendingDepth}` : "infinite"}`)
        this.pendingDepth = 0
        break
      default:
        break
    }
  }

  private handleLine(line: string) {
    if (line.startsWith("bestmove")) {
      this.emit("bestmove", parseBestMove(line))
      console.log(`\x1b[33m  ${line}\x1b[0m`)
      this.handleBestMove()
    } else if (line.startsWith("info depth")) {
      this.emit("info", parseUciMoveInfo(line))
    } else if (line === "readyok") {
      this.emit("readyok")
    }
  }

  /** Sends the pending position to the engine and also emits the position event. */
  private sendPendingPosition() {
    if (this.pendingPosition !== undefined) {
      this.send(`position ${this.pendingPosition}`)
      this.emit("position", this.pendingPosition)
      this.pendingPosition = undefined
    }
  }

  private async sendAndWaitFor(
    command: string,
    pred: (line: string) => boolean,
    timeoutMs = 5000,
    onOutput?: (line: string) => void
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (!this.rl) {
        reject("Engine process not running or stdin not available.")
        return
      }

      const timeout = setTimeout(() => {
        this.removeListener("output", handleOutput)
        reject(new Error(`${command} command timed out.`))
      }, timeoutMs)

      const handleOutput = (line: string) => {
        onOutput?.(line)
        if (pred(line)) {
          this.removeListener("output", handleOutput)
          clearTimeout(timeout)
          resolve()
        }
      }

      this.rl.on("line", handleOutput)
      this.send(command)
    })
  }
}
