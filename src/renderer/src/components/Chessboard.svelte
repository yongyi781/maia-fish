<!-- <script lang="ts">
  import { Chess } from "svelte-chess"
  import type { Color, Move } from "svelte-chess/dist/api"

  type Props = {
    onmove?: (e: CustomEvent<Move>) => void
  }

  let moveNumber: number, turn: Color, history: string[]
  let chessUI: Chess

  export function move(san: string) {
    chessUI.move(san)
  }

  let { onmove }: Props = $props()
</script>

<Chess bind:moveNumber bind:turn bind:history bind:this={chessUI} on:move={onmove} />
<p>
  It's move {moveNumber}, with {turn} to move. Moves played: {history?.join(" ")}.
</p> -->
