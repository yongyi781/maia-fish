<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements"
  import { type Score } from "../types"
  import { formatScore, moveQualityColor } from "../utils"

  type Props = HTMLAttributes<HTMLSpanElement> & {
    score: Score
    best: Score
    side: "w" | "b"
    class?: string
  }

  const { score, best, side, class: className = "", ...restProps }: Props = $props()
</script>

<span
  class={className + " font-bold"}
  style="color: {score === undefined ? 'gray' : moveQualityColor(score, best)}"
  {...restProps}
>
  {score === undefined ? "?" : formatScore(side, score)}
</span>
