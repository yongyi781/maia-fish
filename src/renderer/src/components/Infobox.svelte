<script lang="ts">
  import { gameState, humanProbability, type MoveAnalysis, NodeData, rawEval } from "../game.svelte"
  import Score from "./Score.svelte"

  let humanSort = $state(false)

  function f(a: MoveAnalysis, b: MoveAnalysis) {
    return rawEval(a.score) - rawEval(b.score)
  }

  function g(a: MoveAnalysis, b: MoveAnalysis) {
    return humanProbability(a) - humanProbability(b)
  }

  function cmp(a: MoveAnalysis, b: MoveAnalysis) {
    return humanSort ? g(a, b) || f(a, b) : f(a, b) || g(a, b)
  }

  function color(a: MoveAnalysis) {
    const useLichess = a.lichessProbability !== undefined
    const p = useLichess ? a.lichessProbability : a.maiaProbability
    return `hsl(195, ${useLichess ? 50 : 0}%, ${Math.round(30 + 70 * Math.min(100, 2 * p))}%)`
  }

  function humanThreshold(a: MoveAnalysis) {
    return a.lichessProbability !== undefined ? 0 : 0.02
  }

  function sortedAnalyses(data: NodeData) {
    // Union the top 3 engine moves and all human moves >= 3% probability if maia and all human moves if lichess
    const entries = data.moveAnalyses
    const topEngineMoves = entries
      .filter(([, a]) => a.score !== undefined)
      .sort(([, a], [, b]) => f(b, a))
      .slice(0, 3)
    const topHumanMoves = entries.filter(([, a]) => humanProbability(a) > humanThreshold(a))
    const topMoves = [...new Set([...topEngineMoves, ...topHumanMoves])]
    return topMoves.sort(([, a], [, b]) => cmp(b, a))
  }
</script>

<div>
  {#if gameState.currentNode}
    {@const data = gameState.currentNode.data}
    <div class="p-2"><label><input type="checkbox" bind:checked={humanSort} /> Sort human</label></div>
    <div>
      {#each sortedAnalyses(data) as entry}
        <div class="flex gap-2 items-center">
          <Score class="text-right min-w-12" score={entry[1].score} best={data.eval} turn={data.turn} />
          <div class="text-right min-w-12" style="color: {color(entry[1])}">
            {humanProbability(entry[1]) === undefined ? "" : (humanProbability(entry[1]) * 100).toFixed()}%
          </div>
          <div class="text-xs text-gray-400 min-w-6 text-center">{entry[1].depth}</div>
          <div class="relative flex-1 flex items-center">
            <div class="absolute max-w-full text-ellipsis text-nowrap overflow-hidden">
              {#each entry[1].pv as move, i}
                <span style="color: {(i + (data.turn === 'w' ? 0 : 1)) % 2 == 0 ? 'white' : 'pink'}">{move}</span>&nbsp;
              {/each}
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
