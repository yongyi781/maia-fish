<script lang="ts">
  import type { Score } from "../types"
  import { formatScore, scoreWhitePov } from "../utils"

  const { maxScore = 7, orientation = "white" as "white" | "black" } = $props()

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

  function textColor() {
    return scoreWhite.type === "cp" && scoreWhite.value === 0 ? "grey" : scoreWhite.value > 0 ? "black" : "white"
  }

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

<div class="relative w-10 h-full flex flex-col items-center">
  <div
    class="w-full h-full flex flex-col-reverse rounded-sm overflow-hidden {orientation === 'black'
      ? '-scale-y-100'
      : ''}"
  >
    <div class="bg-[#f0d9b5] transition-[height] duration-300 ease-linear" style="height: {whiteHeight}%"></div>
    <div class="bg-[#444140] transition-[height] duration-300 ease-linear" style="height: {blackHeight}%"></div>
  </div>
  <div
    class="absolute text-xs top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 transition-colors"
    style="color: {textColor()}"
  >
    {formatScore(turn, score)}
  </div>
</div>
