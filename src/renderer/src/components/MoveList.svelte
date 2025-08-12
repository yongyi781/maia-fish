<script lang="ts">
  import { gameState } from "../game.svelte"
  import MoveListNode from "./MoveListNode.svelte"
</script>

<div class="select-none flex flex-wrap h-full">
  <div>
    <MoveListNode node={gameState.game.moves} bind:currentNode={gameState.currentNode} />
  </div>
</div>
