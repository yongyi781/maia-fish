<script lang="ts">
  import { onMount, tick } from "svelte"
  import { Node } from "../game.svelte"
  import MoveListItem from "./MoveListItem.svelte"
  import Self from "./MoveListNode.svelte"

  interface Props {
    node: Node
    currentNode: Node
  }

  let { node, currentNode = $bindable() }: Props = $props()
  let showChildren = $state(false)

  /** To prevent stack overflow. */
  onMount(async () => {
    await tick()
    showChildren = true
  })
</script>

<!-- Layout: first child head, other children heads + recurse, recurse into first child -->
{#if node.children.length > 0}
  {@const children = node.children}
  <MoveListItem node={children[0]} bind:currentNode />
  {#if children.length > 1}
    {#each children as child, i}
      {#if i > 0}
        <span class="text-gray-500">(</span>
        <MoveListItem node={child} bind:currentNode />
        <Self node={child} bind:currentNode />
        <span class="text-gray-500">)&nbsp;</span>
      {/if}
    {/each}
  {/if}
  {#if showChildren}
    <Self node={children[0]} bind:currentNode />
  {/if}
{/if}
