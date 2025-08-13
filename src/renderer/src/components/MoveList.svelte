<script lang="ts">
  import { gameState } from "../game.svelte"
  import MoveListNode from "./MoveListNode.svelte"
</script>

<div class="flex h-full flex-wrap select-none">
  <div>
    <MoveListNode node={gameState.game.moves} />
  </div>
</div>
