<script lang="ts">
  import { Chess, fen, pgn } from "chessops"
  import { makeSanAndPlay, parseSan } from "chessops/san"
  import { Chess as ChessUI } from "svelte-chess"
  import type { Move } from "svelte-chess/dist/api"
  import "./app.css"
  import Chessboard from "./components/Chessboard.svelte"
  import type { NodeData } from "./types"
  import { randomChoice } from "./utils"

  let game = pgn.defaultGame<NodeData>()
  let node: pgn.Node<NodeData> = game.moves
  let chess = Chess.default()
  let chessUI: ChessUI
  let chessboard: Chessboard
  let fenStr: string

  $: {
    let childNode = node as pgn.ChildNode<NodeData>
    fenStr = childNode?.data?.fen ?? game.headers["FEN"] ?? fen.INITIAL_FEN
  }

  function onClick() {
    console.dir(game)
    console.dir(pgn.parsePgn("1. e4 e5")[0])
  }

  function onMove(e: CustomEvent<Move>) {
    chess.play(parseSan(chess, e.detail.san))
    pgn.transform
  }

  window.electron.ipcRenderer.on("playRandomMove", () => {
    let moves = [...chess.allDests()].flatMap((value) =>
      [...value[1]].map((s) => {
        return { from: value[0], to: s }
      })
    )
    let move = randomChoice(moves)
    let san = makeSanAndPlay(chess, move)
    chessboard.move(san)
  })

  // // Find all legal moves
  // export function toDests(chess: Chess) {
  //   const dests = new Map()
  //   SQUARES.forEach((s) => {
  //     const ms = chess.moves({ square: s, verbose: true })
  //     if (ms.length)
  //       dests.set(
  //         s,
  //         ms.map((m) => m.to)
  //       )
  //   })
  //   return dests
  // }

  // // Play a move and toggle whose turn it is
  // export function playOtherSide(chessground: Chessground, chess: Chess) {
  //   return (orig: Key, dest: Key) => {
  //     chess.move({ from: orig, to: dest })
  //     pgnStr = chess.pgn()
  //     moves = chess.moves()
  //     const color = chess.turn() == "w" ? "white" : "black"
  //     chessground.set({
  //       turnColor: color,
  //       movable: {
  //         color: color,
  //         dests: toDests(chess)
  //       }
  //     })
  //   }
  // }

  // onMount(async () => {
  //   chessground.set({
  //     movable: { events: { after: playOtherSide(chessground, chess) } }
  //   })

  //   while (!chess.isGameOver()) {
  //     const moves = chess.moves()
  //     const move = moves[Math.floor(Math.random() * moves.length)]
  //     let m = chess.move(move)
  //     if (m.promotion) console.log(moves)
  //     chessground.set({ fen: chess.fen() })
  //     // chessground.move(m.from as Key, m.to as Key)
  //     // if (m.promotion) chessground.newPiece({ color: colorAbbrevs[m.color], role: pieceAbbrevs[m.promotion] }, m.to)
  //     await delay(50)
  //   }
  //   pgnStr = chess.pgn()
  // })
</script>

<div class="grid grid-cols-[auto_auto_1fr]">
  <div class="w-[512px] select-none">
    <ChessUI bind:this={chessUI} on:move={onMove} />
  </div>
  <div class="p-2"><button on:click={onClick}>Click</button></div>
  <div class="p-2">Hey</div>
  <div class="p-2 col-span-3">FEN&nbsp;&nbsp;&nbsp;&nbsp; {fenStr}</div>
  <div class="p-2 col-span-3"><pre class="text-sm whitespace-pre-wrap rounded p-3 bg-slate-800">{game == null ? "" : pgn.makePgn(game)}</pre></div>
</div>
