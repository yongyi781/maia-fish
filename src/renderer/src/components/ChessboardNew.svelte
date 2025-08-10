<script lang="ts">
  import Chessground from "./Chessground.svelte"
  import PromotionDialog from "./PromotionDialog.svelte"
  let chessground: Chessground
  let container: HTMLDivElement
  let {
    moveNumber = 0,
    turn = "w",
    inCheck = false,
    history = [],
    isGameOver = false,
    fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    orientation = "w",
    engine = void 0,
    class: className = ""
  } = $props()

  let api = void 0
  function load(newFen) {
    if (!api) throw new Error("component not mounted yet")
    api.load(newFen)
  }
  function move(moveSan) {
    if (!api) throw new Error("component not mounted yet")
    api.move(moveSan)
  }
  function getHistory({ verbose = false } = {}) {
    if (!api) throw new Error("component not mounted yet")
    return api.history({ verbose })
  }
  function getBoard() {
    if (!api) throw new Error("component not mounted yet")
    return api.board()
  }
  function undo() {
    if (!api) throw new Error("component not mounted yet")
    return api.undo()
  }
  function reset() {
    if (!api) throw new Error("component not mounted yet")
    api.reset()
  }
  function toggleOrientation() {
    if (!api) throw new Error("component not mounted yet")
    api.toggleOrientation()
  }
  async function playEngineMove() {
    if (!api) throw new Error("component not mounted yet")
    return api.playEngineMove()
  }
  function stateChangeCallback(api2) {
    fen = api2.fen()
    orientation = api2.orientation()
    moveNumber = api2.moveNumber()
    turn = api2.turn()
    inCheck = api2.inCheck()
    history = api2.history()
    isGameOver = api2.isGameOver()
  }
  function promotionCallback(square) {
    return new Promise((resolve) => {
      const element = new PromotionDialog({
        target: container,
        props: {
          square,
          color: orientation,
          callback: (piece) => {
            element.$destroy()
            resolve(piece)
          }
        }
      })
    })
  }
  function moveCallback(move2) {
    $props.onmove?.(move2)
  }
  function gameOverCallback(gameOver) {
    $props.ongameover?.(gameOver)
  }
  $effect(() => {
    if (engine) {
      engine.setUciCallback((message) => $props.onuci?.(message))
    }
    api = new Api(chessground, {
      fen,
      orientation,
      events: {
        move: moveCallback,
        change: stateChangeCallback,
        "game-over": gameOverCallback,
        "promotion-request": promotionCallback
      },
      engine
    })
    api.init().then(() => {
      $props.onready?.()
    })
  })
</script>

<div style="position:relative;" bind:this={container}>
  <Chessground bind:this={chessground} class={className} />
</div>
