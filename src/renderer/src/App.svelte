<script lang="ts">
  import { Chess, fen, makeUci, parseUci } from "chessops"
  import { makeSan, parseSan } from "chessops/san"
  import { onMount } from "svelte"
  import { Chess as ChessUI } from "svelte-chess"
  import type { Move } from "svelte-chess/dist/api"
  import "./app.css"
  import MoveListNode from "./components/MoveListNode.svelte"
  import { gameState, Node } from "./game.svelte"
  import { preprocess, processOutputs } from "./maia-utils"
  import { legalMoves, parseUciInfo, randomChoice } from "./utils"
  import Infobox from "./components/Infobox.svelte"

  let chess = Chess.default()
  let chessUI: ChessUI
  const initialFen = $derived(gameState.game.headers["FEN"] ?? fen.INITIAL_FEN)
  const fenStr = $derived(gameState.currentNode.data.fen ?? initialFen)
  let logText = $state("")

  /** On position changed */
  $effect(() => {
    chess = Chess.fromSetup(fen.parseFen(gameState.currentNode.data.fen).unwrap()).unwrap()
    chessUI?.load(gameState.currentNode.data.fen)
    window.api.sendCommand(
      `position ${initialFen === fen.INITIAL_FEN ? "startpos" : "fen " + initialFen} moves ${gameState.currentNode.movesFromRoot()}`
    )
    const analyses = Object.values(gameState.currentNode.data.moveAnalyses)
    if (analyses.length === 0 || analyses[0].humanProbability === undefined) staticEval()
  })

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

  function onWheel(e: WheelEvent) {
    e.preventDefault()
    if (e.deltaY > 0 && gameState.currentNode.children.length > 0) {
      // Forward
      chessUI.move(gameState.currentNode.children[0].data.san)
    } else if (e.deltaY < 0 && !gameState.currentNode.isRoot()) {
      // Back
      gameState.currentNode = gameState.currentNode.data.parent
    }
  }

  async function analyze() {
    // const config = await window.api.config.get()
    window.api.sendCommand(`go nodes 3000000`)
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

  function processOutput(line: string) {
    if (line.startsWith("info depth")) {
      const info = parseUciInfo(line)
      // This weird roundtrip is needed to convert castling to chessops notation.
      const lan = makeUci(parseSan(chess, makeSan(chess, parseUci(info.pv[0]))))
      gameState.currentNode.data.moveAnalyses[lan].score = info.score
    }
    if (line.startsWith("bestmove")) {
      const san = line.split(" ")[1]
      chessUI.move(san)
    }
  }

  window.electron.ipcRenderer.on("flipBoard", () => {
    chessUI.toggleOrientation()
  })

  window.electron.ipcRenderer.on("playRandomMove", () => {
    chessUI?.move(makeSan(chess, randomChoice(legalMoves(chess))))
  })

  window.api.onOutput((output: string) => {
    // logText = output + "\n" + logText
    for (let line of output.split("\n")) processOutput(line)
  })

  onMount(() => {
    gameState.currentNode = gameState.game.moves
    // For debug: play some moves
    for (let move of ["e4", "c6", "d4", "d5", "e5", "Bf5", "h4"]) chessUI.move(move)
  })
</script>

<!-- Main layout -->
<div class="h-screen grid grid-cols-[auto_1fr_auto_auto] gap-2 p-2">
  <!-- Left -->
  <div class="w-[512px]" onwheel={onWheel}>
    <!-- Chessboard -->
    <ChessUI bind:this={chessUI} on:move={onMove} />
  </div>
  <!-- Right -->
  <div class="grid grid-rows-[auto_1fr_1fr] max-h-[512px]">
    <div><button class="btn" onclick={analyze}>Analyze</button></div>
    <div class="max-h-full overflow-auto">
      <!-- Infobox -->
      <Infobox />
    </div>
    <div class="p-1 max-h-full overflow-auto">
      <div class="select-none flex flex-wrap max-h-full">
        <!-- Move list -->
        <MoveListNode ply={0} node={gameState.game.moves} />
      </div>
    </div>
  </div>
  <div class="col-span-3 flex items-center gap-x-3">
    <span>FEN</span> <input class="w-[600px] text-xs font-mono" type="text" value={fenStr} />
  </div>
  <div class="col-span-3 h-full overflow-auto">
    <pre class="text-sm p-2 whitespace-pre-wrap bg-slate-200 dark:bg-slate-800">{logText}</pre>
  </div>
</div>
