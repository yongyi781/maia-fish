<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements"
  import { humanProbability, type MoveAnalysis } from "../game.svelte"

  interface Props extends HTMLAttributes<HTMLDivElement> {
    analysis: MoveAnalysis
  }

  const { analysis, ...restProps }: Props = $props()

  function useLichess() {
    return analysis.lichessProbability !== undefined
  }

  function color() {
    const p = (useLichess() ? analysis.lichessProbability : analysis.maiaProbability) ?? 0
    return `oklch(${0.4 + 0.6 * Math.min(1, 2 * p)} ${useLichess() ? "0.08" : "0"} 250)`
  }

  function title() {
    if (useLichess()) {
      let str = "Lichess"
      if (analysis.maiaProbability !== undefined) {
        str += ` (Maia: ${(analysis.maiaProbability * 100).toFixed()}%)`
      }
      return str
    }
    return "Maia"
  }

  function text() {
    const p = humanProbability(analysis)
    return p === undefined ? "?" : `${(p * 100).toFixed()}%`
  }
</script>

<div {...restProps} style:color={color()} title={title()}>
  {text()}
</div>
