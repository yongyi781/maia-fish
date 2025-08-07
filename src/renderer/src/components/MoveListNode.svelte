<script lang="ts">
  import { ChildNode, gameState, Node, type NodeData } from "../game.svelte"
  import Self from "./MoveListNode.svelte"

  interface Props {
    ply: number
    node: Node
    firstInVariation?: boolean
  }

  const { ply, node, firstInVariation }: Props = $props()

  function setCurrentNode() {
    if (gameState.currentNode !== node) gameState.currentNode = node
  }

  function inCurrentLine() {
    return node instanceof ChildNode && gameState.currentLine.includes(node)
  }
</script>

{#if node instanceof ChildNode}
  <button
    class="px-1 font-bold hover:bg-[#555577] {node === gameState.currentNode
      ? 'bg-[#333355] outline-1 outline-[#6cccee]'
      : ''} {inCurrentLine() ? '' : 'text-gray-400 dark:text-gray-600'}"
    onmousedown={setCurrentNode}
    onclick={setCurrentNode}
  >
    {#if ply % 2 == 1}
      <span class="font-normal text-sm text-gray-400 dark:text-gray-500"
        >{(ply + 1) / 2}.</span
      >
    {:else if firstInVariation}
      <span class="font-normal text-sm text-gray-400 dark:text-gray-500"
        >{ply / 2}...</span
      >
    {/if}
    {node.data.san}</button
  >
{/if}
{#if node.children.length > 0}
  {#each node.children as child, i}
    {#if i == 0}
      <Self ply={ply + 1} node={child} />
    {:else}
      <span class="text-gray-400 dark:text-gray-600">(</span><Self
        ply={ply + 1}
        node={child}
        firstInVariation
      /><span class="text-gray-500">)</span>
    {/if}
  {/each}
{/if}
