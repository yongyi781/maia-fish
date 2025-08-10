<script lang="ts">
  import { gameState, type MoveAnalysis, rawEval } from "../game.svelte"
  import Score from "./Score.svelte"

  let humanSort = $state(false)

  function f(a: MoveAnalysis, b: MoveAnalysis) {
    return rawEval(a.score) - rawEval(b.score)
  }

  function g(a: MoveAnalysis, b: MoveAnalysis) {
    return a.humanProbability - b.humanProbability
  }

  function cmp(a: MoveAnalysis, b: MoveAnalysis) {
    return humanSort ? g(a, b) || f(a, b) : f(a, b) || g(a, b)
  }

  function probColor(p: number) {
    return `hsl(0, 0%, ${Math.round(30 + 70 * Math.min(100, 2 * p))}%)`
  }

  const sortedAnalyses = $derived.by(() => {
    // Union the top 5 engine moves and top 5 human moves
    const entries = Object.entries(gameState.currentNode.data.moveAnalyses)
    const topEngineMoves = entries
      .filter(([, a]) => a.score !== undefined)
      .sort(([, a], [, b]) => f(b, a))
      .slice(0, 5)
    const topHumanMoves = entries.filter(([, a]) => a.humanProbability >= 0.005)
    const topMoves = [...new Set([...topEngineMoves, ...topHumanMoves])]
    return topMoves.sort(([, a], [, b]) => cmp(b, a))
  })
</script>

<div>
  <label><input type="checkbox" bind:checked={humanSort} /> Sort human</label>
  <div>
    {#each sortedAnalyses as [, a]}
      <div class="flex gap-2 items-center">
        <Score
          class="text-right min-w-12"
          score={a.score}
          best={gameState.currentNode.data.eval}
          side={gameState.currentNode.data.side}
        />
        <div class="text-right min-w-12" style="color: {probColor(a.humanProbability)}">
          {a.humanProbability === undefined ? "" : (a.humanProbability * 100).toFixed()}%
        </div>
        <div class="text-xs text-gray-400 min-w-6 text-center">{a.depth}</div>
        <div class="relative flex-1 flex items-center">
          <div class="absolute max-w-full text-ellipsis text-nowrap overflow-hidden">
            {#each a.pv as move, i}
              <span style="color: {(i + (gameState.currentNode.data.side === 'w' ? 0 : 1)) % 2 == 0 ? 'white' : 'pink'}"
                >{move}</span
              >&nbsp;
            {/each}
          </div>
        </div>
      </div>
    {/each}
  </div>
</div>
