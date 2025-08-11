<script lang="ts">
  import { config } from "../config.svelte"
  import { humanProbability, type MoveAnalysis, NodeData, rawEval } from "../game.svelte"
  import Score from "./Score.svelte"

  const { data }: { data: NodeData } = $props()

  function f(a: MoveAnalysis, b: MoveAnalysis) {
    return rawEval(a.score) - rawEval(b.score)
  }

  function g(a: MoveAnalysis, b: MoveAnalysis) {
    return humanProbability(a) - humanProbability(b)
  }

  function cmp(a: MoveAnalysis, b: MoveAnalysis) {
    return config.value.humanSort ? g(a, b) || f(a, b) : f(a, b) || g(a, b)
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

  function hideLines() {
    return data.turn === "w" ? config.value?.hideLinesForWhite : config.value?.hideLinesForBlack
  }
</script>

<div>
  <div class="flex gap-6 items-center justify-center">
    <div class="flex items-center gap-2">
      <input type="checkbox" id="checkbox1" bind:checked={config.value.humanSort} />
      <label for="checkbox1">Sort human</label>
    </div>
    <div class="flex items-center gap-2">
      <input type="checkbox" id="checkbox2" bind:checked={config.value.hideLinesForWhite} />
      <label for="checkbox2">Hide white lines</label>
    </div>
    <div class="flex items-center gap-2">
      <input type="checkbox" id="checkbox3" bind:checked={config.value.hideLinesForBlack} />
      <label for="checkbox3">Hide black lines</label>
    </div>
  </div>
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
            {#if !hideLines()}
              {#each entry[1].pv as move, i}
                <span style="color: {(i + (data.turn === 'w' ? 0 : 1)) % 2 == 0 ? 'white' : 'pink'}">{move}</span>&nbsp;
              {/each}
            {/if}
          </div>
        </div>
      </div>
    {/each}
  </div>
</div>
