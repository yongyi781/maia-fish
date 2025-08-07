<script lang="ts">
  import { Chess, fen, pgn } from "chessops"
  import { makeSan, parseSan } from "chessops/san"
  import { onMount } from "svelte"
  import { Chess as ChessUI } from "svelte-chess"
  import type { Move } from "svelte-chess/dist/api"
  import "./app.css"
  import MoveListNode from "./components/MoveListNode.svelte"
  import { gameState, Node, ChildNode, type NodeData } from "./game.svelte"
  import { randomChoice } from "./utils"

  let game = $state({
    headers: new Map([
      ["Event", "World Chess Championship"],
      ["White", "Stockfish"],
      ["Black", "Magnus Carlsen"]
    ]),
    moves: new Node()
  })
  let chess = Chess.default()
  let chessUI: ChessUI
  let fenStr: string = $state()
  let moveListNode: MoveListNode
  let logText = $state("")

  $effect(() => {
    fenStr =
      (gameState.currentNode as ChildNode)?.data?.fen ??
      game.headers["FEN"] ??
      fen.INITIAL_FEN
    window.api.sendCommand(
      `position startpos moves ${gameState.currentNode.movesFromRoot()}`
    )
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
      const child = new ChildNode({
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
    } else if (e.deltaY < 0 && gameState.currentNode instanceof ChildNode) {
      // Back
      gameState.currentNode = gameState.currentNode.data.parent
    }
  }

  function loadStockfish() {
    const path = String.raw`C:\Apps\Stockfish\stockfish_x86-64-bmi2.exe`
    window.api.start(path)

    window.api.sendCommand("uci")
    window.api.sendCommand("isready")
    window.api.sendCommand("ucinewgame")
    window.api.sendCommand("setoption name Threads value 14")
    window.api.sendCommand("setoption name UCI_ShowWDL value true")
    window.api.sendCommand("setoption name MultiPV value 3")
  }

  function analyze() {
    console.log("analyze", gameState.currentNode.movesFromRoot())
    window.api.sendCommand("go depth 20")
  }

  function staticEval() {
    window.api.sendCommand("eval")
  }

  function processOutput(line: string) {
    if (line.startsWith("bestmove")) {
      const san = line.split(" ")[1]
      chessUI.move(san)
    }
  }

  $effect(() => {
    if (gameState.currentNode instanceof ChildNode) {
      chess = Chess.fromSetup(
        fen.parseFen(gameState.currentNode.data.fen).unwrap()
      ).unwrap()
      if (chessUI != null) chessUI.load(gameState.currentNode.data.fen)
    } else {
      chess = Chess.default()
      if (chessUI != null && chessUI.reset != null) chessUI.reset()
    }
  })

  window.electron.ipcRenderer.on("flipBoard", () => {
    chessUI.toggleOrientation()
  })

  window.electron.ipcRenderer.on("playRandomMove", () => {
    if (chessUI == null) return
    let moves = [...chess.allDests()].flatMap((value) =>
      [...value[1]].map((s) => {
        return { from: value[0], to: s }
      })
    )
    if (moves.length == 0) {
      console.log("No moves")
      return
    }
    let move = randomChoice(moves)
    chessUI.move(makeSan(chess, move))
  })

  window.api.onOutput((output: string) => {
    logText = output + "\n" + logText
    for (let line of output.split("\n")) processOutput(line)
  })

  onMount(() => {
    gameState.currentNode = game.moves
    // For debug: play some moves
    for (let move of ["e4", "e5", "Nf3", "f6", "Nxe5"]) chessUI.move(move)
  })
</script>

<div class="h-full grid grid-cols-[auto_1fr] gap-2">
  <div class="w-[512px] select-none" onwheel={onWheel}>
    <!-- Chessboard -->
    <ChessUI bind:this={chessUI} on:move={onMove} />
  </div>
  <div class="grid grid-rows-[1fr_1fr] h-full max-h-[512px]">
    <div>
      <!-- Infobox -->
      <button
        type="button"
        class="inline-flex items-center px-5 py-2.5 text-sm font-medium text-center text-white bg-blue-700 rounded-lg hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-700 active:dark:bg-blue-800"
        onclick={loadStockfish}
      >
        Load Stockfish
      </button>
      <button class="btn" onclick={analyze}>Analyze </button>
      <button class="btn" onclick={staticEval}>Static eval </button>
    </div>
    <div class="overflow-scroll p-1">
      <div class="select-none flex flex-wrap">
        <!-- Move list -->
        <MoveListNode ply={0} node={game.moves} bind:this={moveListNode} />
      </div>
    </div>
  </div>
  <div class="col-span-3">FEN&nbsp;&nbsp;&nbsp;&nbsp; {fenStr}</div>
  <div class="col-span-3 flex-1 overflow-scroll overflow-y-auto">
    <pre
      class="text-sm p-2 whitespace-pre-wrap bg-slate-200 dark:bg-slate-800">{logText}</pre>
  </div>
</div>
