import { type ChildProcessWithoutNullStreams, spawn } from "child_process"
import { EventEmitter } from "events"
import type { EngineState, UciBestMove, UciInfo, UciMoveInfo, UciOption } from "../shared"

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
          const val = parseInt(tokens[i++], 10)
          if (kind === "cp" || kind === "mate") {
            info.score = { type: kind, value: val }
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
      case "pv":
        // everything after "pv" are the moves
        info.pv = tokens.slice(i)
        i = tokens.length
        break
      default:
        // unknown key: read next token as its value
        console.log("Unknown key added", key, info[key])
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

export class UciEngine extends EventEmitter {
  state: EngineState = "unloaded"
  private process: ChildProcessWithoutNullStreams | null = null

  constructor(private defaultTimeoutMs = 5000) {
    super()
  }

  start(enginePath: string): Promise<UciInfo> {
    if (this.process) this.kill()
    return new Promise((resolve, reject) => {
      try {
        this.process = spawn(enginePath)

        this.process.stdout.on("data", (data: Buffer) => {
          const output = data.toString()
          // Split by lines and emit each line
          output.split(/\r?\n/).forEach((line) => {
            if (line) this.emit("output", line)
          })
        })

        this.process.stderr.on("data", (data: Buffer) => {
          const error = data.toString()
          this.emit("error", `Engine error: ${error}`)
        })

        this.process.on("close", (code: number) => {
          this.emit("close", code)
          this.process = null
        })

        this.process.on("error", (err: Error) => {
          this.emit("error", `Process error: ${err.message}`)
          reject(err)
        })

        this.uci().then(resolve).catch(reject)
      } catch (error) {
        this.emit("error", `Failed to start engine: ${error}`)
        reject(error)
      }
    })
  }

  kill(): void {
    if (this.process) {
      this.process.kill()
      this.process = null
    }
  }

  /** uci: returns parsed { name, author, options } */
  async uci(timeoutMs = this.defaultTimeoutMs): Promise<UciInfo> {
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
    this.state = "stopped"
    return { name, author, options }
  }

  /** Unblocks when the engine is ready. */
  async isready(timeoutMs = this.defaultTimeoutMs) {
    await this.sendAndWaitFor("isready", (x) => x === "readyok", timeoutMs)
    this.state = "stopped"
  }

  async newGame() {
    if (this.state === "unloaded") throw new Error("Called newGame while engine is unloaded.")
    // Not optional, engine breaks if we call "ucinewgame" while it is running.
    if (this.state === "running") await this.stop()
    this.send("ucinewgame")
    return this.isready()
  }

  position(str: string) {
    if (this.state === "unloaded") throw new Error("Called position while engine is unloaded.")
    // if (this.state !== "stopped") throw new Error("Called position while engine is not in the stopped state.")
    this.send(`position ${str}`)
  }

  /** Sends "go", and returns an async generator that generates info lines. */
  async go(depth?: number) {
    if (this.state !== "stopped") return
    this.state = "running"
    await this.sendAndWaitFor(
      `go${depth ? ` depth ${depth}` : ""}`,
      (x) => x.startsWith("bestmove"),
      this.defaultTimeoutMs,
      (line) => {
        if (line.startsWith("bestmove")) {
          this.emit("bestmove", parseBestMove(line))
        } else if (line.startsWith("info depth") && line.includes(" pv ")) {
          this.emit("info", parseUciMoveInfo(line))
        }
      }
    )
    this.state = "stopped"
  }

  /** Sends "stop" and returns best move. */
  async stop(timeoutMs = this.defaultTimeoutMs) {
    if (this.state !== "running") return
    try {
      let bestMove: UciBestMove | undefined
      await this.sendAndWaitFor(
        "stop",
        (x) => x.startsWith("bestmove"),
        timeoutMs,
        (line) => {
          if (line.startsWith("bestmove")) {
            bestMove = parseBestMove(line)
          }
        }
      )
      return bestMove
    } finally {
      this.state = "stopped"
    }
  }

  setOption(name: string, value: number | string) {
    if (this.state !== "stopped") throw new Error("Called setOption while engine is not in the stopped state.")
    this.send(`setoption name ${name} value ${value}`)
  }

  /** Sends a command. Returns immediately. */
  private send(command: string): void {
    if (!this.process) throw new Error("Engine process not running.")
    if (!this.process.stdin) throw new Error("Engine process stdin not available.")
    console.log("SF command:", command)
    this.process.stdin.write(`${command}\n`)
  }

  private async sendAndWaitFor(
    command: string,
    pred: (line: string) => boolean,
    timeoutMs = 5000,
    onOutput?: (line: string) => void
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
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

      this.on("output", handleOutput)
      this.send(command)
    })
  }
}
