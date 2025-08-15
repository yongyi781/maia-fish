import { Chess, fen } from "chessops"
import type { EngineState, UciMoveInfo, UciOption } from "../../shared"
import { config } from "./config.svelte"
import { gameState, NodeData } from "./game.svelte"
import { chessFromFen, pvUciToSan } from "./utils"

/** Engine client. */
export class Engine {
  name = $state("")
  author = $state("")
  state: EngineState = $state("unloaded")
  autoMode: "forward" | "backward" | "off" = $state("off")
  validOptions: UciOption[] = []
  /** Can be slightly out of sync with main game state, so we use these. */
  private currentNodeData: NodeData = gameState.currentNode.data
  private pos: Chess = chessFromFen(this.currentNodeData.fen)

  constructor() {
    // Try starting
    config.promise.then(() => {
      if (config.value.engine?.path) this.start()
    })
    window.electron.ipcRenderer.on("stateChange", (_, newState: EngineState) => (this.state = newState))
    window.electron.ipcRenderer.on("engine:moveinfos", (_, infos: UciMoveInfo[]) =>
      this.processOutput(infos, this.currentNodeData)
    )
  }

  get analyzing() {
    return this.state === "running" || this.state === "waitingBestMoveToRun"
  }

  /** Starts the engine according to the paths specified in the config. */
  async start() {
    this.state = "unloaded"
    const res = await window.api.engine.start(config.value.engine.path)
    if (res) {
      this.state = "idle"
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
  newGame() {
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
  go() {
    return window.api.engine.go()
  }

  /** Stops the engine and waits for `bestmove`. */
  stop() {
    return window.api.engine.stop()
  }

  /** Updates the engine position. */
  async updatePosition(initialFen: string, moves: string[]) {
    const currentData = gameState.currentNode.data
    let str = `${initialFen === fen.INITIAL_FEN ? "startpos" : "fen " + initialFen}`
    if (moves.length > 0) str += ` moves ${moves.join(" ")}`
    await window.api.engine.position(str)
    this.currentNodeData = currentData
    this.pos = chessFromFen(this.currentNodeData.fen)
  }

  /** Toggles analyze mode. */
  toggleAnalyze() {
    if (this.analyzing) this.stop()
    else this.go()
  }

  private processOutput(infos: UciMoveInfo[], data: NodeData): void {
    for (const item of infos.reverse()) {
      const info = item as UciMoveInfo
      if (info.depth !== undefined && info.pv !== undefined && info.pv.length > 0) {
        const lan = info.pv[0]
        const index = data.lanToIndex.get(lan)
        if (index === undefined) {
          console.debug(`Stale move ignored: ${lan}`)
          break
        }
        const entry = data.moveAnalyses[index][1]
        if (entry && (!entry.depth || info.depth >= entry.depth)) {
          // Convert the PV to SAN.
          info.pv = pvUciToSan(this.pos, info.pv)
          Object.assign(entry, info)
        }
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
        break
      }
    }
  }
}
