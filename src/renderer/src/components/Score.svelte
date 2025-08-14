<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements"
  import { type Score } from "../../../shared"
  import { formatScore, moveQuality } from "../utils"

  type Props = HTMLAttributes<HTMLDivElement> & {
    score: Score | undefined
    best: Score | undefined
    turn: "w" | "b"
    class?: string
  }

  const { score, best, turn, class: className = "", ...restProps }: Props = $props()
</script>

<div
  class={className + " font-bold"}
  style="color: {!score || !best ? 'gray' : moveQuality(score, best)?.color}"
  {...restProps}
>
  {formatScore(turn, score)}
</div>
