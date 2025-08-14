import { fen } from "chessops"
import type { EngineState, UciBestMove, UciMoveInfo, UciOption } from "../../shared"
import { config } from "./config.svelte"
import { gameState } from "./game.svelte"
import { chessFromFen, pvUciToSan } from "./utils"

/** Engine client. */
export class Engine {
  /** Whether we are analyzing. This is different from whether the engine is running. */
  #analyzing = $state(false)
  name = $state("")
  author = $state("")
  state: EngineState = $state("unloaded")
  autoMode: "forward" | "backward" | "off" = $state("off")
  validOptions: UciOption[] = []
  /** The engine's actual state. */
  #off: (() => void) | null = null

  constructor() {
    // Try starting
    config.promise.then(() => {
      if (config.value.engine?.path) this.start()
    })
  }

  get analyzing() {
    return this.#analyzing
  }

  /** Starts the engine according to the paths specified in the config. */
  async start() {
    const res = await window.api.engine.start(config.value.engine.path)
    if (res) {
      this.state = "stopped"
      this.name = res.name ?? "Unknown"
      this.author = res.author ?? "Unknown"
      this.validOptions = res.options
      console.log("Valid options:", this.validOptions)
      this.setStandardOptions()
      this.updatePosition(gameState.root.data.fen, gameState.currentNode.movesFromRootUci())
    } else {
      console.error("Failed to start engine")
    }
  }

  /** Stops the engine and sends a "new game" command to the engine. */
  async newGame() {
    return window.api.engine.newGame()
  }

  /** Sets a UCI option. Returns immediately. */
  setOption(name: string, value: string) {
    window.api.engine.setOption(name, value)
  }

  /** Sets standard options. Returns immediately. */
  setStandardOptions() {
    if (!config.value.engine) return
    this.setOption("Threads", config.value.engine.threads.toString())
    this.setOption("Hash", config.value.engine.hash.toString())
    this.setOption("MultiPV", config.value.engine.multiPV.toString())
  }

  /** Starts analyzing. */
  async go() {
    if (this.state !== "stopped") {
      console.log("Return")
      return
    }
    this.#analyzing = true
    this.#off?.()
    const data = gameState.currentNode.data
    const pos = chessFromFen(data.fen)
    this.#off = window.electron.ipcRenderer.on("engine:moveinfos", (_, infos: (UciMoveInfo | UciBestMove)[]) => {
      for (const item of infos) {
        if (item.bestmove) {
          this.state = "stopped"
          this.#analyzing = false
          return
        } else {
          const info = item as UciMoveInfo
          if (info.depth === undefined || info.pv === undefined || info.pv.length === 0) return
          const lan = info.pv[0]
          const index = data.lanToIndex.get(lan)
          if (index === undefined) {
            console.warn("Unexpected undefined index", lan)
            return
          }
          const entry = data.moveAnalyses[index][1]
          if (entry && (!entry.depth || info.depth >= entry.depth)) {
            // Convert the PV to SAN.
            info.pv = pvUciToSan(pos, info.pv)
            Object.assign(entry, info)
          }
          // Step if auto-analyze depth limit is reached
          const limit = config.value.autoAnalyzeDepthLimit
          if (
            this.autoMode !== "off" &&
            limit !== undefined &&
            data.moveAnalyses.every((a) => a[1].depth !== undefined && a[1].depth >= limit)
          ) {
            if (this.autoMode === "forward") {
              if (!gameState.forward()) this.autoMode = "off"
            } else if (this.autoMode === "backward") {
              if (!gameState.back()) this.autoMode = "off"
            }
            return
          }
        }
      }
    })
    this.state = "running"
    window.api.engine.go()
  }

  /** Stops the engine. Returns the `bestmove`. */
  async stop(analyzeOff = true) {
    if (analyzeOff) this.#analyzing = false
    this.#off?.()
    this.#off = null
    const bestMove = await window.api.engine.stop()
    this.state = "stopped"
    return bestMove
  }

  /** Updates the engine position. */
  async updatePosition(initialFen: string, moves: string[]) {
    if (this.state === "unloaded") return
    const promise = this.stop(false)
    let str = `${initialFen === fen.INITIAL_FEN ? "startpos" : "fen " + initialFen}`
    if (moves.length > 0) str += ` moves ${moves.join(" ")}`
    window.api.engine.position(str)
    await promise
    if (this.analyzing) this.go()
  }

  /** Toggles analyze mode. */
  async toggleAnalyze() {
    if (this.analyzing) return this.stop()
    this.go()
    return undefined
  }

  // /** Main method to process Stockfish output and save the info in the node data. */
  // processOutput(lines: string[], data: NodeData) {
  //   const pos = chessFromFen(data.fen)
  //   for (const line of lines.reverse()) {
  //     if (line.startsWith("info depth") && line.includes(" pv ")) {
  //       const info = parseUciInfo(line)
  //       if (info.depth === undefined || info.pv === undefined || info.pv.length === 0) continue
  //       const lan = info.pv[0]
  //       const index = data.lanToIndex.get(lan)
  //       if (index === undefined) {
  //         console.warn("Unexpected undefined index")
  //         continue
  //       }
  //       const entry = data.moveAnalyses[index][1]
  //       if (entry && (!entry.depth || info.depth >= entry.depth)) {
  //         // Convert the PV to SAN.
  //         info.pv = pvUciToSan(pos, info.pv)
  //         Object.assign(entry, info)
  //       }

  //       // Step if auto-analyze depth limit is reached
  //       const limit = config.value.autoAnalyzeDepthLimit
  //       if (
  //         this.autoMode !== "off" &&
  //         limit !== undefined &&
  //         data.moveAnalyses.every((a) => a[1].depth !== undefined && a[1].depth >= limit)
  //       ) {
  //         if (this.autoMode === "forward") {
  //           if (!gameState.forward()) this.autoMode = "off"
  //         } else if (this.autoMode === "backward") {
  //           if (!gameState.back()) this.autoMode = "off"
  //         }
  //         break
  //       }
  //     } else if (line.startsWith("bestmove")) {
  //       this.status = "stopped"
  //       this.#off?.()
  //       this.#off = undefined
  //     }
  //   }
  // }
}
