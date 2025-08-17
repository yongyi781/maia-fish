<script lang="ts">
  import type { Config } from "chessground/config"
  import type { DrawShape } from "chessground/draw"
  import type { Key, MoveMetadata } from "chessground/types"
  import { Chess, makeSquare, type NormalMove, parseSquare, type Role } from "chessops"
  import { makeFen } from "chessops/fen"
  import { mount, onMount, unmount } from "svelte"
  import { normalizeMove } from "../utils"
  import Chessground, { type Props as ChessgroundProps } from "./Chessground.svelte"
  import PromotionDialog from "./PromotionDialog.svelte"

  interface Props extends ChessgroundProps {
    onmove?: ((move: NormalMove) => void) | undefined
  }

  let { onmove, ...restProps }: Props = $props()

  let container: HTMLDivElement
  let cg: Chessground
  // let promotionVisible = $state(false)
  // let promotionColor: "w" | "b" = $state("w")
  // let pendingMove: NormalMove | undefined

  /** Loads a legal Chess position. */
  export function load(pos: Chess, lastMove?: NormalMove) {
    const dests = new Map<Key, Key[]>()
    for (const [square, moves] of pos.allDests()) {
      dests.set(
        makeSquare(square),
        [...moves].map((dest) => {
          const move = normalizeMove(pos, { from: square, to: dest })
          return makeSquare(move.to)
        })
      )
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

  /** Gets the current Chessground state. */
  export function getState() {
    return cg.getState()
  }

  /** Sets config values. */
  export function set(config: Config) {
    cg.set(config)
  }

  /** Toggles the orientation of the board. */
  export function toggleOrientation() {
    cg.toggleOrientation()
  }

  export function setAutoShapes(shapes: DrawShape[]) {
    cg.setAutoShapes(shapes)
  }

  async function handleCgMove(orig: Key, dest: Key, metadata: MoveMetadata) {
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
        res.promotion = await promotionCallback(dest)
      }
    }
    onmove?.(res)
  }

  // function handlePromotionSelect(piece: string) {
  //   promotionVisible = false
  //   // pendingMove.promotion = piece
  //   onmove?.(pendingMove)
  // }
  function promotionCallback(square: Key) {
    return new Promise<Role>((resolve) => {
      const element = mount(PromotionDialog, {
        target: container,
        props: {
          square,
          color: cg.getState().orientation,
          callback: (piece: Role) => {
            unmount(element)
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
