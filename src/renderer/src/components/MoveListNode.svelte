<script lang="ts">
  import { onMount, tick } from "svelte"
  import { Node } from "../game.svelte"
  import MoveListItem from "./MoveListItem.svelte"
  import Self from "./MoveListNode.svelte"

  interface Props {
    ply: number
    node: Node
  }

  const { ply, node }: Props = $props()
  let showChildren = $state(false)

  onMount(async () => {
    await tick()
    showChildren = true
  })
</script>

<!-- Layout: first child head, other children heads + recurse, recurse into first child -->
{#if node.children.length > 0}
  <MoveListItem ply={ply + 1} node={node.children[0]} />
  {#if node.children.length > 1}
    {#each node.children as child, i}
      {#if i > 0}
        <span class="text-gray-500">(</span>
        <MoveListItem ply={ply + 1} node={child} firstInVariation />
        <Self ply={ply + 1} node={child} />
        <span class="text-gray-500">)&nbsp;</span>
      {/if}
    {/each}
  {/if}
  {#if showChildren}
    <!-- No idea why but this is fast while while just using node.children[0] is very slow. -->
    {#each node.children.slice(0, 1) as child}
      <Self ply={ply + 1} node={child} />
    {/each}
  {/if}
{/if}
