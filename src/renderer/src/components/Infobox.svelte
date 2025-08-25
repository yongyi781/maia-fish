<script lang="ts">
  import { config } from "../config.svelte"
  import { gameState, humanProbability, type MoveAnalysis, Node, rawEval } from "../game.svelte"
  import { parseUci } from "../utils"
  import HumanProbability from "./HumanProbability.svelte"
  import Score from "./Score.svelte"

  interface Props {
    node: Node
  }

  const { node }: Props = $props()

  function f(a: MoveAnalysis, b: MoveAnalysis) {
    return rawEval(a.score) - rawEval(b.score)
  }

  function g(a: MoveAnalysis, b: MoveAnalysis) {
    return humanProbability(a) - humanProbability(b)
  }

  function cmp(a: MoveAnalysis, b: MoveAnalysis) {
    return config.value.humanSort ? g(a, b) || f(a, b) : f(a, b) || g(a, b)
  }

  function humanThreshold(a: MoveAnalysis) {
    return a.lichessProbability !== undefined ? 0 : 0.02
  }

  function sortedAnalyses() {
    const entries = node.data.sortedAnalyses
    const topEngineMoves = entries.slice(0, 3)
    const topHumanMoves = entries.filter((a) => humanProbability(a) > humanThreshold(a) || isNextMove(a.lan))
    const set = new Set([...topEngineMoves, ...topHumanMoves])
    return [...set].sort((a, b) => cmp(b, a))
  }

  function hideLines() {
    return node.data.turn === "w" ? config.value?.hideLinesForWhite : config.value?.hideLinesForBlack
  }

  function handleClick(e: MouseEvent, a: MoveAnalysis) {
    e.preventDefault()
    if (e.button === 0) {
      gameState.makeMove(parseUci(a.lan))
    } else if (e.button === 1 || e.button === 2) {
      const res = gameState.currentNode.addLine(a.pv)
      if (e.button === 2) gameState.userSetCurrentNode(res)
    }
  }

  function isNextMove(lan: string) {
    return node.children.length === 0 ? false : node.children[0].data.lan === lan
  }
</script>

<div class="relative h-full">
  <div class="absolute max-h-full w-full overflow-auto p-1">
    {#each sortedAnalyses() as a (a.lan)}
      <button
        class="flex w-full items-center gap-2 hover:bg-zinc-700 {isNextMove(a.lan) ? 'outline outline-zinc-500' : ''}"
        onmousedown={(e) => handleClick(e, a)}
      >
        <Score class="min-w-12 text-right" score={a.score} best={node.data.eval} turn={node.data.turn} />
        <HumanProbability class="min-w-12 text-right" analysis={a} />
        <div class="min-w-6 text-center text-xs text-gray-400">{a.depth}</div>
        <div class="relative flex flex-1 items-center">
          <div class="absolute max-w-full overflow-hidden text-nowrap text-ellipsis" title={a.pv.join(" ")}>
            {#if !hideLines()}
              {#each a.pv as move, i (i)}
                <span style="color: {(i + (node.data.turn === 'w' ? 0 : 1)) % 2 == 0 ? 'white' : 'pink'}">{move}</span
                >&nbsp;
              {/each}
            {/if}
          </div>
        </div>
      </button>
    {/each}
  </div>
</div>
