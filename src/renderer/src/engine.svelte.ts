import { fen } from "chessops"
import { NodeData } from "./game.svelte"
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
  /** The engine's actual status. */
  status: "stopped" | "running" = $state("stopped")
  /** Whether we are currently changing the position. */
  positionChanging = false

  get analyzing() {
    return this.#analyzing
  }

  set analyzing(value) {
    if (value !== this.#analyzing) {
      if (value) {
        this.#analyzing = true
        window.api.engine.send("go")
        this.status = "running"
      } else {
        this.#analyzing = false
        window.api.engine.send("stop")
      }
    }
  }

  /** Sends a "new game" command to the engine. Also stops analyzing. */
  newGame() {
    this.analyzing = false
    window.api.engine.send("ucinewgame")
  }

  public setOption(name: string, value: string): void {
    window.api.engine.send(`setoption name ${name} value ${value}`)
  }

  /** Updates the engine position. */
  updateEnginePosition(initialFen: string, moves: string[]) {
    let shouldStartEngine = false
    if (this.analyzing) {
      this.positionChanging = true
      if (this.status === "running") {
        window.api.engine.send("stop")
      } else {
        shouldStartEngine = true
        this.positionChanging = false
      }
    }

    let command = `position ${initialFen === fen.INITIAL_FEN ? "startpos" : "fen " + initialFen}`
    if (moves.length > 0) command += ` moves ${moves.join(" ")}`
    window.api.engine.send(command)
    if (shouldStartEngine) {
      window.api.engine.send("go")
      this.status = "running"
    }
  }

  /** Toggles analyze mode. */
  toggleAnalyze() {
    this.analyzing = !this.analyzing
  }

  /** Main method to process Stockfish output and save the info in the node data. */
  processLine(line: string, data: NodeData) {
    try {
      if (!this.positionChanging && line.startsWith("info depth") && line.includes(" pv ")) {
        const info = parseUciInfo(line)
        const lan = info.pv[0]
        const entry = data.moveAnalyses.find((m) => m[0] === lan)?.[1]

        if (entry && (!entry.depth || info.depth >= entry.depth)) {
          // Convert the PV to SAN.
          info.pv = pvUciToSan(chessFromFen(data.fen), info.pv)
          Object.assign(entry, info)
        }
      } else if (line.startsWith("bestmove")) {
        // "bestmove" = engine stopped.
        if (this.analyzing && this.positionChanging) {
          // Debounce
          // clearTimeout(pendingEngineTimeout)
          this.positionChanging = false
          window.api.engine.send("go")
          this.status = "running"
        } else {
          // Stopped on its own (e.g. reached depth 245).
          this.status = "stopped"
        }
      }
    } catch (error) {
      throw error
    }
  }
}
