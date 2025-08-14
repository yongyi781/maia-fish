import { type ChildProcessWithoutNullStreams, spawn } from "child_process"
import * as readline from "readline"
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

export class UciEngine {
  state: EngineState = "unloaded"
  private process: ChildProcessWithoutNullStreams | null = null

  constructor(private defaultTimeoutMs = 5000) {}

  start(enginePath: string) {
    if (this.process) this.kill()
    try {
      this.process = spawn(enginePath)
      return this.uci()
    } catch (error) {
      throw new Error(`Failed to start engine: ${String(error)}`)
    }
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
    for await (const line of this.sendAndReceive("uci", (line) => line === "uciok", timeoutMs)) {
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
    // if (this.state !== "stopped") throw new Error("Called position while engine is not in the stopped state.")
    this.send(`position ${str}`)
  }

  /** Sends "go", and returns an async generator that generates info lines. */
  async *go(depth?: number) {
    if (this.state !== "stopped") throw new Error("Called go while engine is not in the stopped state.")
    this.state = "running"
    for await (const line of this.sendAndReceive(`go${depth ? ` depth ${depth}` : ""}`, (x) =>
      x.startsWith("bestmove")
    )) {
      if (line.startsWith("bestmove")) {
        yield parseBestMove(line)
      } else if (line.startsWith("info depth") && line.includes(" pv ")) {
        yield parseUciMoveInfo(line)
      }
    }
    this.state = "stopped"
  }

  /** Sends "stop" and returns best move. */
  async stop(timeoutMs = this.defaultTimeoutMs) {
    if (this.state !== "running") return
    try {
      const bestMoveStr = await this.sendAndWaitFor("stop", (x) => x.startsWith("bestmove"), timeoutMs)
      return parseBestMove(bestMoveStr)
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

  private async *sendAndReceive(command: string, pred: (line: string) => boolean, timeoutMs = 0) {
    if (!this.process) throw new Error("Engine process not running.")

    const rl = readline.createInterface({
      input: this.process.stdout,
      crlfDelay: Infinity
    })

    let timeoutId: NodeJS.Timeout | undefined
    let timedOut = false

    // Start timeout if needed
    if (timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        timedOut = true
        rl.close()
      }, timeoutMs)
    }

    try {
      this.send(command)

      for await (const line of rl) {
        if (timedOut) break
        yield line
        if (pred(line)) break
      }

      if (timedOut) throw new Error(`Command timed out after ${timeoutMs} ms`)
    } finally {
      clearTimeout(timeoutId)
      rl.close()
    }
  }

  private async sendAndWaitFor(command: string, pred: (line: string) => boolean, timeoutMs = 0) {
    let lastLine: string | undefined
    for await (const line of this.sendAndReceive(command, pred, timeoutMs)) lastLine = line
    if (!lastLine) throw new Error(`Stream exited before receiving expected line.`)
    return lastLine
  }
}
