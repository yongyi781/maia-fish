<script lang="ts">
  import { config } from "../config.svelte"
  import { gameState, humanProbability, type MoveAnalysis, NodeData, rawEval } from "../game.svelte"
  import { parseUci } from "../utils"
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

  function handleClick(e: MouseEvent, entry: [string, MoveAnalysis]) {
    e.preventDefault()
    if (e.button === 0) {
      gameState.makeMove(parseUci(entry[0]))
    } else if (e.button === 1 || e.button === 2) {
      const res = gameState.currentNode.addMoves(entry[1].pv)
      if (e.button === 2) gameState.userSetCurrentNode(res)
    }
  }
</script>

<div class="relative h-full">
  <div class="absolute max-h-full w-full overflow-auto pt-2">
    {#each sortedAnalyses(data) as entry}
      <button class="flex w-full items-center gap-2 hover:bg-zinc-700" onmousedown={(e) => handleClick(e, entry)}>
        <Score class="min-w-12 text-right" score={entry[1].score} best={data.eval} turn={data.turn} />
        <div class="min-w-12 text-right" style="color: {color(entry[1])}">
          {humanProbability(entry[1]) === undefined ? "" : (humanProbability(entry[1]) * 100).toFixed()}%
        </div>
        <div class="min-w-6 text-center text-xs text-gray-400">{entry[1].depth}</div>
        <div class="relative flex flex-1 items-center">
          <div class="absolute max-w-full overflow-hidden text-nowrap text-ellipsis" title={entry[1].pv.join(" ")}>
            {#if !hideLines()}
              {#each entry[1].pv as move, i}
                <span style="color: {(i + (data.turn === 'w' ? 0 : 1)) % 2 == 0 ? 'white' : 'pink'}">{move}</span>&nbsp;
              {/each}
            {/if}
          </div>
        </div>
      </button>
    {/each}
  </div>
</div>
