import { Chess, fen } from "chessops"
import { onMount } from "svelte"
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
  private currentNodeData: NodeData | undefined
  private pos: Chess | undefined

  constructor() {
    // Try starting
    config.promise.then(() => {
      if (config.value.engine?.path) this.start()
    })

    onMount(() => {
      const offs = [
        window.electron.ipcRenderer.on("engine:stateChange", (_, newState: EngineState) => (this.state = newState)),
        window.electron.ipcRenderer.on("engine:position", (_, str: string) => this.syncWithEnginePosition(str)),
        window.electron.ipcRenderer.on("engine:moveinfos", (_, infos: Map<string, UciMoveInfo>) =>
          this.processOutput(infos)
        )
      ]
      return () => {
        for (const off of offs) off()
      }
    })
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
  updatePosition(initialFen: string, moves: string[]) {
    let str = `${initialFen === fen.INITIAL_FEN ? "startpos" : "fen " + initialFen}`
    if (moves.length > 0) str += ` moves ${moves.join(" ")}`
    window.api.engine.position(str)
  }

  /** Toggles analyze mode. */
  toggleAnalyze() {
    if (this.analyzing) this.stop()
    else this.go()
  }

  /** Parses a string like "startpos moves [moves]" or "fen [fen] moves [moves]". */
  private parseEnginePosition(str: string) {
    const parts = str.split(" moves ")
    const initialFen = parts[0] === "startpos" ? fen.INITIAL_FEN : parts[0].substring(4)
    const moves = parts.length <= 1 ? [] : parts[1].split(" ")
    return { initialFen, moves }
  }

  /** Synchronizes with the engine position. */
  private syncWithEnginePosition(str: string) {
    const { initialFen, moves } = this.parseEnginePosition(str)
    let node = gameState.root
    if (node.data.fen !== initialFen) {
      console.warn("Fen mismatch", str, node.data.fen)
      this.currentNodeData = undefined
      this.pos = undefined
    } else if (moves) {
      for (const move of moves) {
        const res = node.children.find((c) => c.data.lan === move)
        if (!res) {
          console.warn("Move mismatch")
          this.currentNodeData = undefined
          this.pos = undefined
          break
        }
        node = res
      }
    }
    this.currentNodeData = node.data
    this.pos = chessFromFen(node.data.fen)
  }

  private processOutput(infos: Map<string, UciMoveInfo>): void {
    if (!this.currentNodeData || !this.pos) return
    for (const [lan, info] of infos) {
      if (
        info.depth !== undefined &&
        info.pv !== undefined &&
        info.pv.length > 0 &&
        info.score !== undefined &&
        info.score.bound === undefined
      ) {
        const index = this.currentNodeData.lanToIndex.get(lan)
        if (index === undefined) {
          console.debug(`Stale move ignored: ${lan}`)
          break
        }
        const entry = this.currentNodeData.moveAnalyses[index]
        if (entry && (!entry.depth || info.depth >= entry.depth)) {
          // Convert the PV to SAN.
          info.pv = pvUciToSan(this.pos, info.pv)
          info.lastUpdated = performance.now()
          Object.assign(entry, info)
        }
      }
      // Step if auto-analyze depth limit is reached
      const limit = config.value.autoAnalyzeDepthLimit
      if (
        this.autoMode !== "off" &&
        limit !== undefined &&
        gameState.currentNode.data.moveAnalyses.every((a) => a.depth !== undefined && a.depth >= limit)
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
