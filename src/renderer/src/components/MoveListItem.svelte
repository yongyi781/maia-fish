<script lang="ts">
  import { gameState, Node } from "../game.svelte"

  interface Props {
    ply: number
    node: Node
    currentNode: Node
    firstInVariation?: boolean
  }

  let { ply, node, currentNode = $bindable(), firstInVariation }: Props = $props()
  const inCurrentLine = $derived(gameState.currentLine.includes(node))

  function setCurrentNode() {
    if (currentNode !== node) currentNode = node
  }

  function outlineColor() {
    return gameState.isMainline ? "#6cccee" : "#ffee66"
  }

  function bgColor() {
    return gameState.isMainline ? "#444466" : "#444422"
  }
</script>

<button
  class="px-1 font-bold hover:bg-[#555577] {node === currentNode && 'outline-1'} {!inCurrentLine &&
    'text-gray-400 dark:text-gray-600'}"
  style:background-color={node === currentNode ? bgColor() : ""}
  style:outline-color={outlineColor()}
  onmousedown={setCurrentNode}
  onclick={setCurrentNode}
>
  {#if ply % 2 == 1}
    <span class="font-normal text-sm text-gray-400 dark:text-gray-500">{(ply + 1) / 2}.</span>
  {:else if firstInVariation}
    <span class="font-normal text-sm text-gray-400 dark:text-gray-500">{ply / 2}...</span>
  {/if}
  {node.data.san}</button
>
