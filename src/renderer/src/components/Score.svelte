<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements"
  import { type Score } from "../types"
  import { formatScore, moveQuality } from "../utils"

  type Props = HTMLAttributes<HTMLSpanElement> & {
    score: Score
    best: Score
    turn: "w" | "b"
    class?: string
  }

  const { score, best, turn, class: className = "", ...restProps }: Props = $props()
</script>

{#if isFinite(score?.value) && isFinite(best?.value)}
  <span
    class={className + " font-bold"}
    style="color: {score === undefined ? 'gray' : moveQuality(score, best)?.color}"
    {...restProps}
  >
    {score === undefined ? "?" : formatScore(turn, score)}
  </span>
{/if}
