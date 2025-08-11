import { fen } from "chessops"
import { gameState, NodeData } from "./game.svelte"
import { chessFromFen, pvUciToSan } from "./utils"
import { Score } from "./types"

export interface UciInfo {
  depth?: number
  seldepth?: number
  multipv?: number
  score?: Score
  nodes?: number
  nps?: number
  hashfull?: number
  tbhits?: number
  time?: number // milliseconds
  pv?: string[] // principal variation moves
  [key: string]: any // for any other fields
}

/** Parse a single UCI "info" line into a UciInfo object.  */
function parseUciInfo(line: string): UciInfo {
  const tokens = line.trim().split(/\s+/)
  if (tokens.shift() !== "info") {
    throw new Error("Not a UCI info line")
  }

  const info: UciInfo = {}
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

export class Engine {
  /** Whether we are analyzing. This is different from whether the engine is running. */
  #analyzing = $state(false)
  /** The main engine output listener. */
  #off?: () => void
  #stopOff?: () => void
  /** The engine's actual status. */
  status: "stopped" | "running" = $state("stopped")
  positionChanging = false

  get analyzing() {
    return this.#analyzing
  }

  /** Sends a "new game" command to the engine. Also stops analyzing. */
  async newGame() {
    await this.stop()
    window.api.engine.send("ucinewgame")
  }

  setOption(name: string, value: string): void {
    window.api.engine.send(`setoption name ${name} value ${value}`)
  }

  /** Starts the engine. */
  go() {
    if (this.status === "running") return
    this.#analyzing = true
    this.#off?.()
    this.#off = undefined
    const data = gameState.currentNode.data
    this.#off = window.electron.ipcRenderer.on("engine-output", (_, output: string) => {
      try {
        for (let line of output.split("\n")) this.processLine(line, data)
      } catch (error) {
        console.error(error)
      }
    })
    window.api.engine.send("go")
    this.status = "running"
  }

  /** Stops the engine. Listens for `bestmove`. */
  async stop(analyzeOff = true) {
    if (analyzeOff) this.#analyzing = false
    this.#off?.()
    this.#off = undefined
    if (this.status === "stopped" || this.#stopOff) return
    window.api.engine.send("stop")
    return new Promise<void>((resolve) => {
      this.#stopOff = window.electron.ipcRenderer.on("engine-output", (_, output: string) => {
        for (let line of output.split("\n")) {
          if (line.startsWith("bestmove")) {
            this.status = "stopped"
            this.#stopOff?.()
            this.#stopOff = undefined
            resolve()
            break
          }
        }
      })
    })
  }

  /** Updates the engine position. */
  async updatePosition(initialFen: string, moves: string[]) {
    const promise = this.stop(false)
    let command = `position ${initialFen === fen.INITIAL_FEN ? "startpos" : "fen " + initialFen}`
    if (moves.length > 0) command += ` moves ${moves.join(" ")}`
    window.api.engine.send(command)
    await promise
    if (this.analyzing) this.go()
  }

  /** Toggles analyze mode. */
  async toggleAnalyze() {
    if (this.analyzing) return this.stop()
    this.go()
  }

  /** Main method to process Stockfish output and save the info in the node data. */
  processLine(line: string, data: NodeData) {
    if (line.startsWith("info depth") && line.includes(" pv ")) {
      const info = parseUciInfo(line)
      const lan = info.pv[0]
      const entry = data.moveAnalyses.find((m) => m[0] === lan)?.[1]

      if (entry && (!entry.depth || info.depth >= entry.depth)) {
        // Convert the PV to SAN.
        info.pv = pvUciToSan(chessFromFen(data.fen), info.pv)
        Object.assign(entry, info)
      }
    } else if (line.startsWith("bestmove")) {
      this.status = "stopped"
      this.#off?.()
      this.#off = undefined
    }
  }
}
