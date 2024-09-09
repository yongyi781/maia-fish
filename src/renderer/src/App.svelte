<script lang="ts">
  import { Chess, fen, pgn } from "chessops"
  import { makeSan, parseSan } from "chessops/san"
  import { onMount } from "svelte"
  import { Chess as ChessUI } from "svelte-chess"
  import type { Move } from "svelte-chess/dist/api"
  import "./app.css"
  import MoveListNode from "./components/MoveListNode.svelte"
  import type { MyNodeData } from "./MyNodeData"
  import { currentNode } from "./stores"
  import { randomChoice } from "./utils"

  let game = pgn.defaultGame<MyNodeData>(
    () =>
      new Map<string, string>([
        ["Event", "World Chess Championship"],
        ["Date", new Date().toISOString().slice(0, 10).replace(/-/g, ".")],
        ["Round", "1"],
        ["White", "Stockfish"],
        ["Black", "Magnus Carlsen"]
      ])
  )
  let chess = Chess.default()
  let chessUI: ChessUI
  let fenStr: string

  $currentNode = game.moves
  $: {
    fenStr = ($currentNode as pgn.ChildNode<MyNodeData>)?.data?.fen ?? game.headers["FEN"] ?? fen.INITIAL_FEN
  }

  function onClick() {}

  function onMove(e: CustomEvent<Move>) {
    chess.play(parseSan(chess, e.detail.san))

    let exists = false
    for (let c of $currentNode.children)
      if (c.data.san === e.detail.san) {
        $currentNode = c
        exists = true
        break
      }
    if (!exists) {
      $currentNode = pgn.extend($currentNode, [{ fen: e.detail.after, san: e.detail.san, parent: $currentNode }])
    }
    game = game
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault()
    if (e.deltaY > 0 && $currentNode.children.length > 0) {
      // Forward
      chessUI.move($currentNode.children[0].data.san)
    } else if (e.deltaY < 0 && $currentNode instanceof pgn.ChildNode) {
      // Back
      // chessUI.undo()
      $currentNode = ($currentNode as pgn.ChildNode<MyNodeData>).data.parent
    }
  }

  currentNode.subscribe((value) => {
    if (value instanceof pgn.ChildNode) {
      chess = Chess.fromSetup(fen.parseFen(value.data.fen).unwrap()).unwrap()
      if (chessUI != null) chessUI.load(value.data.fen)
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

  onMount(() => {
    // For debug: play some moves
    chessUI.move("e4")
    chessUI.move("e5")
  })
</script>

<div class="grid grid-cols-[auto_1fr] gap-2">
  <div class="w-[512px] select-none" on:wheel={onWheel}>
    <ChessUI bind:this={chessUI} on:move={onMove} />
  </div>
  <div class="grid grid-rows-[1fr_1fr] gap-2 h-full max-h-[512px]">
    <div>
      <!-- Infobox -->
      <button class="btn" on:click={onClick}
        >Click <span class="inline-flex items-center justify-center w-4 h-4 ms-2 text-xs font-semibold text-blue-800 bg-blue-200 rounded-full"> 2 </span>
      </button>
      <button
        type="button"
        class="inline-flex items-center px-5 py-2.5 text-sm font-medium text-center text-white bg-blue-700 rounded-lg hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-700 active:dark:bg-blue-800"
      >
        Messages
      </button>
      <button class="flex flex-col justify-center ml-3" on:click={() => document.body.classList.toggle("dark")}>
        <input type="checkbox" name="light-switch" class="light-switch sr-only" />
        <label class="relative cursor-pointer p-2" for="light-switch">
          <svg class="dark:hidden" width="16" height="16" xmlns="http://www.w3.org/2000/svg">
            <path
              class="fill-slate-300"
              d="M7 0h2v2H7zM12.88 1.637l1.414 1.415-1.415 1.413-1.413-1.414zM14 7h2v2h-2zM12.95 14.433l-1.414-1.413 1.413-1.415 1.415 1.414zM7 14h2v2H7zM2.98 14.364l-1.413-1.415 1.414-1.414 1.414 1.415zM0 7h2v2H0zM3.05 1.706 4.463 3.12 3.05 4.535 1.636 3.12z"
            />
            <path class="fill-slate-400" d="M8 4C5.8 4 4 5.8 4 8s1.8 4 4 4 4-1.8 4-4-1.8-4-4-4Z" />
          </svg>
          <svg class="hidden dark:block" width="16" height="16" xmlns="http://www.w3.org/2000/svg">
            <path class="fill-slate-400" d="M6.2 1C3.2 1.8 1 4.6 1 7.9 1 11.8 4.2 15 8.1 15c3.3 0 6-2.2 6.9-5.2C9.7 11.2 4.8 6.3 6.2 1Z" />
            <path
              class="fill-slate-500"
              d="M12.5 5a.625.625 0 0 1-.625-.625 1.252 1.252 0 0 0-1.25-1.25.625.625 0 1 1 0-1.25 1.252 1.252 0 0 0 1.25-1.25.625.625 0 1 1 1.25 0c.001.69.56 1.249 1.25 1.25a.625.625 0 1 1 0 1.25c-.69.001-1.249.56-1.25 1.25A.625.625 0 0 1 12.5 5Z"
            />
          </svg>
          <span class="sr-only">Switch to light / dark version</span>
        </label>
      </button>
    </div>
    <div class="select-none overflow-scroll">
      <!-- Move list -->
      <MoveListNode ply={0} node={game.moves} />
    </div>
  </div>
  <div class="col-span-3">FEN&nbsp;&nbsp;&nbsp;&nbsp; {fenStr}</div>
  <div class="col-span-3"><pre class="text-sm p-2 whitespace-pre-wrap bg-slate-200 dark:bg-slate-800">{game == null ? "" : pgn.makePgn(game)}</pre></div>
</div>
