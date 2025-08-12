import { fen } from "chessops"
import { gameState, NodeData } from "./game.svelte"
import { Score } from "./types"
import { chessFromFen, pvUciToSan } from "./utils"
import { config } from "./config.svelte"

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
  autoMode: "forward" | "backward" | "off" = $state("off")

  constructor() {
    window.api.engine.start("")
  }

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
    this.#off = window.electron.ipcRenderer.on("engine-output", async (_, lines: string[]) => {
      this.processOutput(lines, data)
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
      this.#stopOff = window.electron.ipcRenderer.on("engine-output", (_, lines: string[]) => {
        for (let line of lines) {
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
  processOutput(lines: string[], data: NodeData) {
    const pos = chessFromFen(data.fen)
    for (const line of lines.reverse()) {
      if (line.startsWith("info depth") && line.includes(" pv ")) {
        const info = parseUciInfo(line)
        const lan = info.pv[0]
        const index = data.lanToIndex.get(lan)
        if (index === undefined) {
          console.warn("Unexpected undefined index")
          continue
        }
        const entry = data.moveAnalyses[index][1]
        if (entry && (!entry.depth || info.depth >= entry.depth)) {
          // Convert the PV to SAN.
          info.pv = pvUciToSan(pos, info.pv)
          Object.assign(entry, info)
        }
        if (
          this.autoMode !== "off" &&
          data.moveAnalyses.every((a) => a[1].depth >= config.value.autoAnalyzeDepthLimit)
        ) {
          if (this.autoMode === "forward") {
            if (!gameState.forward()) this.autoMode = "off"
          } else if (this.autoMode === "backward") {
            if (!gameState.back()) this.autoMode = "off"
          }
          break
        }
      } else if (line.startsWith("bestmove")) {
        this.status = "stopped"
        this.#off?.()
        this.#off = undefined
      }
    }
  }
}
