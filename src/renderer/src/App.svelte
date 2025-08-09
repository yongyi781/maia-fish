<script lang="ts">
  import { Chess, fen, parseSquare, parseUci } from "chessops"
  import { parseFen } from "chessops/fen"
  import { makeSan, parseSan } from "chessops/san"
  import { onMount, untrack } from "svelte"
  import { Chess as ChessUI } from "svelte-chess"
  import type { Move } from "svelte-chess/dist/api"
  import "./app.css"
  import Infobox from "./components/Infobox.svelte"
  import MoveListNode from "./components/MoveListNode.svelte"
  import { gameState, Node } from "./game.svelte"
  import { preprocess, processOutputs } from "./maia-utils"
  import {
    allLegalMoves,
    chessFromFen,
    formatScore,
    parseUciInfo,
    pvUciToSan,
    randomChoice,
    randomWeightedChoice
  } from "./utils"

  let chess = Chess.default()
  let chessUI: ChessUI
  const initialFen = $derived(gameState.game.moves.data.fen ?? fen.INITIAL_FEN)
  const fenStr = $derived(gameState.currentNode.data.fen ?? initialFen)
  /** Whether we are analyzing. */
  let analyzing = $state(false)
  /** The engine's actual status. */
  let engineStatus: "stopped" | "running" = "stopped"
  /** Whether we are currently changing the position. */
  let positionChanging = false

  function onPositionChanged() {
    chess = chessFromFen(gameState.currentNode.data.fen)
    chessUI?.load(gameState.currentNode.data.fen)
    const analyses = Object.values(gameState.currentNode.data.moveAnalyses)
    if (analyses.length === 0 || analyses[0].humanProbability === undefined) staticEval()
    let shouldStartEngine = false
    if (analyzing) {
      positionChanging = true
      if (engineStatus === "running") {
        window.api.sendEngineCommand("stop")
      } else {
        shouldStartEngine = true
        positionChanging = false
      }
    }
    let command = `position ${initialFen === fen.INITIAL_FEN ? "startpos" : "fen " + initialFen}`
    const moves = gameState.currentNode.movesFromRoot()
    if (moves.length > 0) command += ` moves ${moves}`
    window.api.sendEngineCommand(command)
    if (shouldStartEngine) {
      window.api.sendEngineCommand("go")
      engineStatus = "running"
    }
  }

  function onMove(e: CustomEvent<Move>) {
    chess.play(parseSan(chess, e.detail.san))

    let exists = false
    for (let c of gameState.currentNode.children)
      if (c.data.san === e.detail.san) {
        gameState.currentNode = c
        exists = true
        break
      }
    if (!exists) {
      const child = new Node({
        fen: e.detail.after,
        lan: e.detail.lan,
        san: e.detail.san,
        parent: gameState.currentNode
      })
      gameState.currentNode.children.push(child)
      gameState.currentNode = child
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === " ") {
      const ae = document.activeElement
      if (ae.tagName !== "INPUT" && ae.tagName !== "TEXTAREA" && !ae["isContentEditable"]) {
        e.preventDefault()
        onAnalyzeClicked()
      }
    }
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault()
    if (e.deltaY > 0) {
      goForward()
    } else if (e.deltaY < 0) {
      goBack()
    }
  }

  async function onAnalyzeClicked() {
    if (analyzing) {
      analyzing = false
      window.api.sendEngineCommand("stop")
    } else {
      analyzing = true
      window.api.sendEngineCommand("go")
      engineStatus = "running"
    }
  }

  /** Evaluates the position with Maia. */
  async function staticEval() {
    const currentNode = gameState.currentNode
    const { boardInput, eloSelfCategory, eloOppoCategory, legalMoves } = preprocess(currentNode.data.fen, 1900, 1900)
    const { logits_maia, logits_value } = await window.api.analyzeMaia({
      boardInput,
      eloSelfCategory,
      eloOppoCategory
    })
    const outputs = processOutputs(fenStr, logits_maia, logits_value, legalMoves)
    for (let [lan, a] of Object.entries(currentNode.data.moveAnalyses)) {
      a.humanProbability = outputs.policy[lan]
    }
  }

  /** Main method to process Stockfish output */
  function processEngineOutput(line: string) {
    try {
      if (!positionChanging && line.startsWith("info depth") && line.includes(" pv ")) {
        const info = parseUciInfo(line)
        if (!info.pv) {
          console.error("PV missing?", line)
          return
        }
        const lan = info.pv[0]
        // Convert the PV to SAN.
        info.pv = pvUciToSan(chess, info.pv)
        Object.assign(gameState.currentNode.data.moveAnalyses[lan], info)
      } else if (line.startsWith("bestmove")) {
        // "bestmove" = engine stopped.
        if (analyzing) {
          if (positionChanging) {
            positionChanging = false
            window.api.sendEngineCommand("go")
            engineStatus = "running"
          } else {
            // Stopped on its own (e.g. exhausted the tree).
            engineStatus = "stopped"
          }
        }
      }
    } catch (error) {
      console.error(error)
    }
  }

  function goForward() {
    if (gameState.currentNode.children.length > 0) chessUI.move(gameState.currentNode.children[0].data.san)
  }

  function goBack() {
    if (!gameState.currentNode.isRoot()) gameState.currentNode = gameState.currentNode.data.parent
  }

  function loadFen(fen: string) {
    gameState.game = {
      headers: new Map([
        ["Event", "World Chess Championship"],
        ["White", "Stockfish"],
        ["Black", "Magnus Carlsen"],
        ["FEN", fen]
      ]),
      moves: new Node({ fen: fen })
    }
    gameState.currentNode = gameState.game.moves
  }

  $effect(() => {
    gameState.currentNode
    untrack(() => {
      onPositionChanged()
    })
  })

  onMount(() => {
    gameState.currentNode = gameState.game.moves

    window.electron.ipcRenderer.on("newGame", () => {
      gameState.game = {
        headers: new Map([
          ["Event", "World Chess Championship"],
          ["White", "Stockfish"],
          ["Black", "Magnus Carlsen"]
        ]),
        moves: new Node()
      }
      gameState.currentNode = gameState.game.moves
    })

    window.electron.ipcRenderer.on("pasteFenPgn", (_, [text]: string[]) => {
      console.debug(text)
      const setup = parseFen(text)
      if (setup.isOk) {
        loadFen(text)
      } else {
        const pgn = text.match(/^\[(.*?)\]\s*([^\[]*)$/s)
        if (pgn) {
          const [_, headers, moves] = pgn
          console.debug("Headers:", headers)
          console.debug("Moves:", moves)
        } else {
          console.error("Invalid FEN or PGN")
        }
      }
    })

    window.electron.ipcRenderer.on("gotoRoot", () => {
      gameState.currentNode = gameState.game.moves
    })

    window.electron.ipcRenderer.on("gotoEnd", () => {
      gameState.currentNode = gameState.currentNode.end()
    })

    window.electron.ipcRenderer.on("goBack", () => {
      goBack()
    })

    window.electron.ipcRenderer.on("goForward", () => {
      goForward()
    })

    window.electron.ipcRenderer.on("deleteNode", () => {
      const parent = gameState.currentNode.data.parent
      if (parent) {
        parent.children = parent.children.filter((c) => c !== gameState.currentNode)
        gameState.currentNode = parent
      }
    })

    window.electron.ipcRenderer.on("deleteOtherLines", () => {
      let node = gameState.currentNode.end()
      let parent = node.data.parent
      while (parent) {
        parent.children = parent.children.filter((c) => c === node)
        node = parent
        parent = parent.data.parent
      }
    })

    window.electron.ipcRenderer.on("flipBoard", () => {
      chessUI.toggleOrientation()
    })

    window.electron.ipcRenderer.on("playWeightedHumanMove", () => {
      const entries = Object.entries(gameState.currentNode.data.moveAnalyses)
      if (entries.length === 0 || entries[0][1].humanProbability === undefined) return
      const moves: [string, number][] = entries.map((a) => [a[0], a[1].humanProbability])
      const move = randomWeightedChoice(moves)
      chessUI.move(makeSan(chess, parseUci(move)))
    })

    window.electron.ipcRenderer.on("playTopHumanMove", () => {
      const entries = Object.entries(gameState.currentNode.data.moveAnalyses)
      if (entries.length === 0 || entries[0][1].humanProbability === undefined) return
      const move = entries.reduce((a, b) => (a[1].humanProbability > b[1].humanProbability ? a : b))[0]
      chessUI.move(makeSan(chess, parseUci(move)))
    })

    window.electron.ipcRenderer.on("playRandomMove", () => {
      chessUI.move(makeSan(chess, randomChoice(allLegalMoves(chess))))
    })

    window.api.onOutput((output: string) => {
      for (let line of output.split("\n")) processEngineOutput(line)
    })

    return () => {
      window.electron.ipcRenderer.removeAllListeners("newGame")
      window.electron.ipcRenderer.removeAllListeners("gotoRoot")
      window.electron.ipcRenderer.removeAllListeners("gotoEnd")
      window.electron.ipcRenderer.removeAllListeners("goBack")
      window.electron.ipcRenderer.removeAllListeners("goForward")
      window.electron.ipcRenderer.removeAllListeners("deleteNode")
      window.electron.ipcRenderer.removeAllListeners("deleteOtherLines")
      window.electron.ipcRenderer.removeAllListeners("flipBoard")
      window.electron.ipcRenderer.removeAllListeners("playWeightedHumanMove")
      window.electron.ipcRenderer.removeAllListeners("playTopHumanMove")
      window.electron.ipcRenderer.removeAllListeners("playRandomMove")
    }
  })
</script>

<svelte:window
  onkeydown={onKeyDown}
  onbeforeunload={() => {
    analyzing = false
    window.api.sendEngineCommand("stop")
  }}
/>

<!-- Main layout -->
<div class="h-screen flex flex-col gap-1 p-1">
  <div class="flex gap-2">
    <!-- Left -->
    <div class=" w-[576px]" onwheel={onWheel}>
      <!-- Chessboard -->
      <ChessUI bind:this={chessUI} on:move={onMove} />
    </div>
    <!-- Right -->
    <div class="flex flex-1 gap-2 flex-col max-h-[576px]">
      <div>
        <button class="btn" onclick={onAnalyzeClicked}>{analyzing ? "Stop" : "Analyze"}</button>
        <span class="font-bold text-xl"
          >{formatScore(gameState.currentNode.data.side, gameState.currentNode.data.eval)}</span
        >
        (Human: {formatScore(gameState.currentNode.data.side, gameState.currentNode.data.humanEval)})
      </div>
      <div class=" flex-2/3 overflow-auto">
        <!-- Infobox -->
        <Infobox />
      </div>
      <div class="flex-1/3 overflow-auto">
        <!-- Move list root -->
        <div class="p-1 select-none flex flex-wrap max-h-full">
          <MoveListNode ply={0} node={gameState.game.moves} />
        </div>
      </div>
    </div>
  </div>
  <div class="flex items-center gap-x-3">
    <span>FEN</span>
    <input
      class="w-[600px] text-xs font-mono"
      type="text"
      value={fenStr}
      onfocus={(e) => {
        e.currentTarget.select()
      }}
      onkeydown={(e) => {
        if (e.key === "Enter") {
          loadFen(e.currentTarget.value)
          e.currentTarget.blur()
        }
      }}
    />
  </div>
  <div class="p-2 text-center">
    <button
      class="btn"
      onclick={() => {
        const f = chess.isLegal({ from: parseSquare("e8"), to: parseSquare("g8") })
        console.log(f)
      }}>Debug</button
    >
  </div>
</div>
