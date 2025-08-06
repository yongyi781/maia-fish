<script lang="ts">
  import { ChildNode, Node } from "chessops/pgn"
  import type { MyNodeData } from "../MyNodeData"
  import { currentNode } from "../stores"

  export let ply: number
  export let node: Node<MyNodeData>
  export let firstInVariation = false

  function setCurrentNode() {
    if ($currentNode !== node) $currentNode = node
  }

  function inCurrentLine() {
    let n = $currentNode.end()
    while (n instanceof ChildNode) {
      if (n === node) return true
      n = n.data.parent
    }
    return false
  }
</script>

{#if node instanceof ChildNode}
  <button
    class="px-1 font-bold hover:bg-[#555577] {$currentNode === node ? 'bg-[#333355] outline outline-1 outline-[#6cccee]' : ''} {inCurrentLine()
      ? ''
      : 'text-gray-400 dark:text-gray-600'}"
    on:mousedown={setCurrentNode}
    on:click={setCurrentNode}
  >
    {#if ply % 2 == 1}
      <span class="font-normal text-sm text-gray-400 dark:text-gray-500">{(ply + 1) / 2}.</span>
    {:else if firstInVariation}
      <span class="font-normal text-sm text-gray-400 dark:text-gray-500">{ply / 2}...</span>
    {/if}
    {node.data.san}</button
  >
{/if}
{#if node.children.length > 0}
  <svelte:self ply={ply + 1} bind:node={node.children[0]} />
  {#each node.children.slice(1) as child}
    <span class="text-gray-400 dark:text-gray-600">(</span><svelte:self ply={ply + 1} bind:node={child} firstInVariation /><span class="text-gray-500">)</span>
  {/each}
{/if}
