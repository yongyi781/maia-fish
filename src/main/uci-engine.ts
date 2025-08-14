import { type ChildProcessWithoutNullStreams, spawn } from "child_process"
import { EventEmitter } from "events"
import * as readline from "readline"

export interface UciOption {
  name: string
  type: "string" | "spin" | "button" | "check" | "combo"
  default?: string
  min?: number
  max?: number
}

export class UciEngine extends EventEmitter {
  private engineProcess: ChildProcessWithoutNullStreams | null = null
  private rl: readline.Interface | null = null

  // default timeout used by various operations (ms)
  constructor(private defaultTimeoutMs = 5000) {
    super()
  }

  // start enginePath with optional args and spawn options
  async start(enginePath: string) {
    // kill existing if any
    if (this.engineProcess) {
      this.kill()
    }

    return new Promise<void>((resolve, reject) => {
      try {
        // ensure pipes for stdio
        this.engineProcess = spawn(enginePath)

        // handle spawn errors (e.g., ENOENT)
        this.engineProcess.on("error", (err) => {
          this.emit("error", `Process error: ${err.message}`)
          reject(err)
        })

        // create readline from stdout
        this.rl = readline.createInterface({
          input: this.engineProcess.stdout,
          crlfDelay: Infinity
        })

        // emit raw output lines
        this.rl.on("line", (line: string) => {
          // lines often come with trailing spaces; trim for predicates
          const trimmed = line.trim()
          this.emit("output", trimmed)
          // also emit parsed events for common prefixes
          if (trimmed.startsWith("id name ")) {
            this.emit("id", "name", trimmed.substring(8))
          } else if (trimmed.startsWith("id author ")) {
            this.emit("id", "author", trimmed.substring(10))
          } else if (trimmed.startsWith("option ")) {
            this.emit("optionLine", trimmed)
          } else if (trimmed.startsWith("info ")) {
            this.emit("info", trimmed)
          } else if (trimmed.startsWith("bestmove ")) {
            this.emit("bestmove", trimmed)
          }
        })

        this.engineProcess.stderr.on("data", (data: Buffer) => {
          const error = data.toString()
          this.emit("error", `Engine stderr: ${error}`)
        })

        this.engineProcess.on("close", (code: number | null) => {
          this.emit("close", code)
          // cleanup
          if (this.rl) {
            this.rl.close()
            this.rl.removeAllListeners()
            this.rl = null
          }
          this.engineProcess = null
        })

        // send uci and wait for uciok and readyok in sequence
        this.uci()
          .then(() => this.isready())
          .then(() => resolve())
          .catch((err) => reject(err))
      } catch (error) {
        this.emit("error", `Failed to start engine: ${String(error)}`)
        reject(error)
      }
    })
  }

  kill(): void {
    if (this.engineProcess) {
      this.engineProcess.kill()
      this.engineProcess = null
    }
    if (this.rl) {
      this.rl.close()
      this.rl = null
    }
  }

  send(command: string): void {
    if (!this.engineProcess || !this.engineProcess.stdin) {
      this.emit("error", "Engine process not running or stdin not available.")
      return
    }
    try {
      this.engineProcess.stdin.write(`${command}\n`)
    } catch (err) {
      this.emit("error", `Failed to write to stdin: ${String(err)}`)
    }
  }

  /** uci: returns parsed { name, author, options } */
  async uci(timeoutMs = this.defaultTimeoutMs): Promise<{ name?: string; author?: string; options: UciOption[] }> {
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
            this.emit("option", options[options.length - 1])
          } else {
            // fallback: keep the raw line
            this.emit("warning", `Unparsable option line: ${line}`)
          }
        }
      }
    )

    return { name, author, options }
  }

  isready(timeoutMs = this.defaultTimeoutMs) {
    return this.sendAndWaitFor("isready", (x) => x === "readyok", timeoutMs)
  }

  newGame() {
    this.send("ucinewgame")
    return this.isready()
  }

  go() {
    this.send("go")
  }

  async goDepth(depth: number, timeoutMs = 20000): Promise<{ bestmove: string; ponder?: string } | null> {
    const line = await this.sendAndWaitFor(`go depth ${depth}`, (x) => x.startsWith("bestmove"), timeoutMs)
    return this.parseBestmove(line)
  }

  async stop(timeoutMs = this.defaultTimeoutMs): Promise<{ bestmove: string; ponder?: string } | null> {
    const line = await this.sendAndWaitFor("stop", (x) => x.startsWith("bestmove"), timeoutMs)
    return this.parseBestmove(line)
  }

  setOption(name: string, value: string) {
    this.send(`setoption name ${name} value ${value}`)
  }

  // parse a bestmove line: "bestmove e2e4 ponder e7e5"
  private parseBestmove(line: string | undefined | null) {
    if (!line) return null
    const m = line.match(/^bestmove\s+(\S+)(?:\s+ponder\s+(\S+))?/)
    if (!m) return null
    return { bestmove: m[1], ponder: m[2] }
  }

  private sendAndWaitFor(
    command: string,
    pred: (line: string) => boolean,
    timeoutMs = 5000,
    onOutput?: (line: string) => void
  ): Promise<string> {
    this.send(command)
    return new Promise((resolve, reject) => {
      if (!this.engineProcess) return reject(new Error("Engine not running"))

      const cleanup = () => {
        clearTimeout(timer)
        this.removeListener("output", onLine)
        this.engineProcess?.removeListener("close", onClose)
        this.engineProcess?.removeListener("error", onError)
      }

      const onLine = (line: string) => {
        onOutput?.(line)
        if (pred(line)) {
          cleanup()
          resolve(line)
        }
      }

      const onClose = (code: number | null) => {
        cleanup()
        reject(new Error(`Engine closed ${code}`))
      }
      const onError = (err: Error) => {
        cleanup()
        reject(err)
      }

      this.on("output", onLine)
      this.engineProcess.once("close", onClose)
      this.engineProcess.once("error", onError)

      const timer = setTimeout(() => {
        cleanup()
        reject(new Error(`Command '${command}' timed out`))
      }, timeoutMs)
    })
  }
}
