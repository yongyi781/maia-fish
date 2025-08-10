<script lang="ts">
  import type { MoveMetadata, Key } from "chessground/types"
  import { Chess, makeSquare, type NormalMove, parseSquare } from "chessops"
  import { INITIAL_FEN, makeFen } from "chessops/fen"
  import { onMount } from "svelte"
  import Chessground from "./Chessground.svelte"
  import PromotionDialog from "./PromotionDialog.svelte"

  let {
    moveNumber = 0,
    turn = "w",
    inCheck = false,
    history = [],
    isGameOver = false,
    fen = INITIAL_FEN,
    orientation = "w",
    onmove = undefined as (move: NormalMove) => void,
    ...restProps
  } = $props()

  let cg: Chessground
  let container: HTMLDivElement
  let promotionVisible = $state(false)
  let promotionColor: "w" | "b" = $state("w")
  let pendingMove: NormalMove | undefined

  /** Loads a legal Chess position. */
  export function load(pos: Chess, lastMove?: NormalMove) {
    const dests = new Map<Key, Key[]>()
    for (const [square, moves] of pos.allDests()) {
      dests.set(makeSquare(square), [...moves].map(makeSquare))
    }
    cg.set({
      fen: makeFen(pos.toSetup()),
      turnColor: pos.turn,
      check: pos.isCheck(),
      lastMove: lastMove ? [makeSquare(lastMove.from), makeSquare(lastMove.to)] : undefined,
      selected: undefined,
      movable: {
        free: false,
        color: pos.turn,
        dests,
        events: {
          after: handleCgMove
        }
      }
    })
  }

  export function toggleOrientation() {
    cg.toggleOrientation()
  }

  function handleCgMove(orig: Key, dest: Key, metadata: MoveMetadata) {
    if (orig === "a0" || dest === "a0") {
      // the Chessground square type (Key) includes a0
      throw Error("invalid square")
    }
    let res: NormalMove = { from: parseSquare(orig), to: parseSquare(dest) }
    const isPromotion =
      cg.getState().pieces.get(dest)?.role === "pawn" && (dest.charAt(1) == "1" || dest.charAt(1) == "8")
    if (isPromotion) {
      if (metadata.ctrlKey) {
        res.promotion = "queen"
      } else {
        res.promotion = "queen"
      }
    } else {
      onmove?.(res)
    }
  }

  function handlePromotionSelect(piece: string) {
    promotionVisible = false
    // pendingMove.promotion = piece
    onmove?.(pendingMove)
  }

  function promotionCallback(square: any) {
    return new Promise<string>((resolve) => {
      const element = new PromotionDialog({
        target: container,
        props: {
          square,
          color: orientation,
          callback: (piece: string | PromiseLike<string>) => {
            element.$destroy()
            resolve(piece)
          }
        }
      })
    })
  }

  onMount(async () => {
    load(Chess.default())
  })
</script>

<div class="relative" bind:this={container}>
  <Chessground bind:this={cg} {...restProps} />
  <!-- <PromotionDialog color={promotionColor} visible={promotionVisible} onselect={handlePromotionSelect} /> -->
</div>
