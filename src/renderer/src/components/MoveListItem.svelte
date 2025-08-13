<script lang="ts">
  import { gameState, Node } from "../game.svelte"
  import { nagToColor, nagToSymbol } from "../utils"

  interface Props {
    node: Node
  }

  let { node }: Props = $props()
  const inCurrentLine = $derived(gameState.currentLine.includes(node))

  function forceShowMoveNumber() {
    return node.data.parent.isRoot() || node.data.parent.children[0] !== node
  }

  function setCurrentNode() {
    if (gameState.currentNode !== node) gameState.userSetCurrentNode(node)
  }

  function outlineColor() {
    return gameState.isMainline ? "#6cccee" : "#ffee66"
  }

  function bgColor() {
    return gameState.isMainline ? "#444466" : "#444422"
  }
</script>

<button
  class="px-1 font-bold hover:bg-[#555577] {node === gameState.currentNode && 'outline-1'} {!inCurrentLine &&
    'text-gray-400 dark:text-gray-600'}"
  style:background-color={node === gameState.currentNode ? bgColor() : ""}
  style:outline-color={outlineColor()}
  style:color={inCurrentLine ? nagToColor[node.data.engineNag] : undefined}
  onmousedown={setCurrentNode}
  onclick={setCurrentNode}
>
  {#if node.data.turn === "b"}
    <span class="text-sm font-normal text-gray-400 dark:text-gray-500">{node.data.moveNumber}.</span>
  {:else if forceShowMoveNumber()}
    <span class="text-sm font-normal text-gray-400 dark:text-gray-500">{node.data.moveNumber}...</span>
  {/if}
  {node.data.san}{nagToSymbol[node.data.engineNag]}</button
>
