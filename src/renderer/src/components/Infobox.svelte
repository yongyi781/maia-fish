<script lang="ts">
  import { parseUci } from "chessops"
  import { makeSan } from "chessops/san"
  import { gameState, rawEval } from "../game.svelte"
  import { type Score } from "../types"
  import { chessFromFen } from "../utils"

  let humanSort = $state(false)
  let sortMode: "engine" | "human" = $derived(humanSort ? "human" : "engine")

  const sortedAnalyses = $derived.by(() => {
    if (sortMode === "engine") {
      return Object.entries(gameState.currentNode.data.moveAnalyses).sort(
        (a, b) => rawEval(b[1].score) - rawEval(a[1].score)
      )
    } else {
      return Object.entries(gameState.currentNode.data.moveAnalyses).sort(
        (a, b) => b[1].humanProbability - a[1].humanProbability
      )
    }
  })

  function formatScore(score: Score) {
    if (!score) return ""
    switch (score.type) {
      case "cp": {
        const value = gameState.currentNode.data.side() === "b" ? -score.value / 100 : score.value / 100
        return value < 0 ? value.toFixed(2) : `+${value.toFixed(2)}`
      }
      case "mate": {
        const value = gameState.currentNode.data.side() === "b" ? -score.value : score.value
        return value < 0 ? `-#${-value}` : value > 0 ? `#${value}` : ""
      }
      case "tablebase":
        return `T#${score.value}`
    }
  }
</script>

<div>
  <label><input type="checkbox" bind:checked={humanSort} /> Sort human</label>
  {#if gameState.currentNode}
    <table class="w-full">
      <thead>
        <tr>
          <th>Move</th>
          <th>Human</th>
          <th>Engine</th>
        </tr>
      </thead>
      <tbody>
        {#each sortedAnalyses as [key, a]}
          <tr>
            <td>{makeSan(chessFromFen(gameState.currentNode.data.fen), parseUci(key))}</td>
            <td>{(a.humanProbability * 100).toFixed()}%</td>
            <td>{formatScore(a.score)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>
