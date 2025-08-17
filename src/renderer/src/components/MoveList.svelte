<script lang="ts">
  import { gameState, type Opening } from "../game.svelte"
  import MoveListNode from "./MoveListNode.svelte"

  let opening: Opening | undefined = $derived.by(() => {
    // Walk up the tree, take first node with an opening
    let node = gameState.currentNode
    while (node.data.parent) {
      if (node.data.opening) return node.data.opening
      node = node.data.parent
    }
    return undefined
  })
</script>

<div class="h-full">
  <div class="min-h-6 w-full text-center leading-6">
    {#if opening}
      {opening.eco}: {opening.name}
    {/if}
  </div>
  <hr class="my-1 text-zinc-700" />
  <div class="select-none">
    <MoveListNode node={gameState.game.moves} />
  </div>
</div>
