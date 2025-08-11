<script lang="ts">
  import { onMount, tick } from "svelte"
  import { Node } from "../game.svelte"
  import MoveListItem from "./MoveListItem.svelte"
  import Self from "./MoveListNode.svelte"

  interface Props {
    ply: number
    node: Node
    currentNode: Node
  }

  let { ply, node, currentNode = $bindable() }: Props = $props()
  let showChildren = $state(false)

  onMount(async () => {
    await tick()
    showChildren = true
  })
</script>

<!-- Layout: first child head, other children heads + recurse, recurse into first child -->
{#if node.children.length > 0}
  {@const children = node.children}
  <MoveListItem ply={ply + 1} node={children[0]} bind:currentNode />
  {#if children.length > 1}
    {#each children as child, i}
      {#if i > 0}
        <span class="text-gray-500">(</span>
        <MoveListItem ply={ply + 1} node={child} bind:currentNode firstInVariation />
        <Self ply={ply + 1} node={child} bind:currentNode />
        <span class="text-gray-500">)&nbsp;</span>
      {/if}
    {/each}
  {/if}
  {#if showChildren}
    <Self ply={ply + 1} node={children[0]} bind:currentNode />
  {/if}
{/if}
