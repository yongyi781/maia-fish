<script lang="ts">
  import { onMount } from "svelte"
  import { gameState } from "../game.svelte"
  import { chessFromFen, classifyMove, cpToWinProb, moveQualities, nagToColor, scoreWhitePov } from "../utils"

  const { class: className = "", ...restProps } = $props()

  let canvas: HTMLCanvasElement
  let ctx: CanvasRenderingContext2D

  const mainlineColor = "#8cfc"
  const mainlineSolid = "#8cf"
  const variationColor = "#ff8c"
  const variationSolid = "#ff8"
  const statusBarHeight = 20
  let dragging = false

  function mainHeight() {
    return canvas.height - statusBarHeight
  }

  function getDenom() {
    return Math.max(40, gameState.currentLine.length) - 1
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Median (0 cp)
    ctx.strokeStyle = "#333"
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, Math.round(mainHeight() / 2) + 0.5)
    ctx.lineTo(canvas.width, Math.round(mainHeight() / 2) + 0.5)
    ctx.stroke()

    // Baseline and top line
    ctx.strokeStyle = "#888"
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, Math.round(mainHeight()) + 0.5)
    ctx.lineTo(canvas.width, Math.round(mainHeight()) + 0.5)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0, 0.5)
    ctx.lineTo(canvas.width, 0.5)
    ctx.stroke()

    ctx.fillStyle = "white"
    ctx.strokeStyle = "white"
    ctx.lineWidth = 2
    const currentLine = gameState.currentLine
    let indexCurrentMove: number | undefined
    const markers = []
    const denom = getDenom()
    ctx.beginPath()
    for (let i = 0, j = currentLine.length - 1; j >= 0; ++i, --j) {
      const l = currentLine[j]
      const lEval = l.data.eval
      if (l === gameState.currentNode) indexCurrentMove = i

      let winProb: number = 0.5
      const outcome = chessFromFen(l.data.fen).outcome()
      if (outcome) {
        winProb = outcome.winner === "white" ? 1 : outcome.winner === "black" ? 0 : 0.5
      } else {
        const e = scoreWhitePov(l.data.turn, lEval)
        if (!e) continue
        if (e) winProb = e.type === "mate" ? (e.value >= 0 ? 1 : 0) : cpToWinProb(e.value)
      }

      const x = (i / denom) * (canvas.width - 5)
      const y = 5 + (1 - winProb) * (mainHeight() - 10)
      ctx.lineTo(x + 0.5, y + 0.5)

      // Outcome/mistake/blunder markers
      if (outcome) {
        const markerFill = outcome.winner ?? "grey"
        markers.push(
          {
            outerColor: markerFill,
            radius: 7,
            x,
            y
          },
          {
            outerColor: markerFill,
            radius: 5,
            x,
            y: canvas.height - statusBarHeight / 2
          }
        )
      } else if (l.data.engineNag > 0) {
        markers.push({
          outerColor: nagToColor[l.data.engineNag],
          innerColor: l.data.turn === "w" ? "black" : "white",
          radius: 8,
          x,
          y
        })
      }

      // Human difficulty rating marker
      const lHumanEval = l.data.humanEval
      if (lEval && lHumanEval && lHumanEval.value) {
        const c = classifyMove(lHumanEval, lEval)
        if (c) {
          const q = c === "best" ? moveQualities.good : moveQualities[c]
          markers.push({
            outerColor: q.color,
            radius: 5,
            x,
            y: canvas.height - statusBarHeight / 2
          })
        }
      }
    }
    ctx.stroke()

    for (const marker of markers) {
      ctx.beginPath()
      ctx.arc(marker.x + 0.5, marker.y, marker.radius, 0, 2 * Math.PI)
      ctx.fillStyle = marker.outerColor
      ctx.fill()
      ctx.beginPath()
      ctx.arc(marker.x + 0.5, marker.y, 3, 0, 2 * Math.PI)
      if (marker.innerColor) ctx.fillStyle = marker.innerColor
      ctx.fill()
    }

    // Draw line at current move
    if (indexCurrentMove !== undefined) {
      ctx.lineWidth = 1
      ctx.strokeStyle = gameState.isMainline ? mainlineSolid : variationSolid
      ctx.beginPath()
      const x = Math.round((indexCurrentMove / denom) * (canvas.width - 5)) + 0.5
      ctx.moveTo(x, 0)
      ctx.lineTo(x, canvas.height)
      ctx.stroke()
    }
  }

  function handleClick(e: MouseEvent) {
    const x = e.offsetX
    const currentLine = gameState.currentLine
    const index = Math.max(
      0,
      Math.min(currentLine.length - 1, currentLine.length - 1 - Math.round((x / (canvas.width - 5)) * getDenom()))
    )
    gameState.userSetCurrentNode(gameState.currentLine[index])
  }

  onMount(() => {
    ctx = canvas.getContext("2d")!
    ctx.imageSmoothingEnabled = false

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries.find((entry) => entry.target === canvas)
      if (entry) {
        canvas.width = entry.devicePixelContentBoxSize[0].inlineSize
        canvas.height = entry.devicePixelContentBoxSize[0].blockSize
        draw()
      }
    })

    resizeObserver.observe(canvas, { box: "device-pixel-content-box" })

    $effect(() => {
      draw()
    })

    return () => {
      resizeObserver.disconnect()
    }
  })
</script>

<div
  {...restProps}
  class="relative h-full rounded-sm {className}"
  style="border-color: {gameState.isMainline ? mainlineColor : variationColor};"
>
  <canvas
    bind:this={canvas}
    class="absolute h-full w-full"
    onmousedown={(e) => {
      handleClick(e)
      dragging = true
    }}
    onmousemove={(e) => {
      if (dragging) {
        if (!e.buttons) dragging = false
        else handleClick(e)
      }
    }}
    onmouseup={() => {
      dragging = false
    }}
  ></canvas>
</div>
