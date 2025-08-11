<script lang="ts">
  import type { Score } from "../types"
  import { scoreWhitePov } from "../utils"

  const { maxScore = 7, orientation = "white" as "white" | "black", class: className = "", ...restProps } = $props()

  let turn: "w" | "b" = $state("w")
  let score: Score = $state({
    type: "cp",
    value: 0
  })

  const scoreWhite = $derived(scoreWhitePov(turn, score))

  const whiteHeight = $derived(
    scoreWhite.type === "mate"
      ? scoreWhite.value > 0
        ? 100
        : 0
      : Math.max(0, Math.min(100, 50 + scoreWhite.value / (2 * maxScore)))
  )
  const blackHeight = $derived(100 - whiteHeight)

  export function update(newTurn: "w" | "b", newScore: Score) {
    if (newScore) {
      turn = newTurn
      score = newScore
    }
  }

  export function reset() {
    turn = "w"
    score = {
      type: "cp",
      value: 0
    }
  }
</script>

<div {...restProps} class="relative w-6 h-full flex flex-col items-center {className}">
  <div
    class="w-full h-full flex flex-col-reverse rounded-sm overflow-hidden {orientation === 'black'
      ? '-scale-y-100'
      : ''}"
  >
    <div class="bg-[#ddd] transition-[height] duration-300 ease-linear" style="height: {whiteHeight}%"></div>
    <div class="bg-[#444] transition-[height] duration-300 ease-linear" style="height: {blackHeight}%"></div>
  </div>
</div>
