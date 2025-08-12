<script lang="ts">
  import { gameState, Node } from "../game.svelte"

  interface Props {
    node: Node
    currentNode: Node
  }

  let { node, currentNode = $bindable() }: Props = $props()
  const inCurrentLine = $derived(gameState.currentLine.includes(node))

  function forceShowMoveNumber() {
    return node.data.parent.isRoot() || node.data.parent.children[0] !== node
  }

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
  {#if node.data.turn === "b"}
    <span class="font-normal text-sm text-gray-400 dark:text-gray-500">{node.data.moveNumber}.</span>
  {:else if forceShowMoveNumber()}
    <span class="font-normal text-sm text-gray-400 dark:text-gray-500">{node.data.moveNumber}...</span>
  {/if}
  {node.data.san}</button
>
