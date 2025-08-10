<script lang="ts">
  import { onMount } from "svelte"
  import { gameState } from "../game.svelte"
  import { chessFromFen, cpToWinProb, moveQualities, scoreWhitePov } from "../utils"

  let canvas: HTMLCanvasElement
  let ctx: CanvasRenderingContext2D

  const mainlineColor = "#8cfc"
  const variationColor = "#ff8c"

  function getDenom() {
    return Math.max(40, gameState.currentLine.length) - 1
  }
  let dragging = false

  function draw() {
    console.debug("Draw")
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Median (0 cp)
    ctx.strokeStyle = "grey"
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, canvas.height / 2)
    ctx.lineTo(canvas.width, canvas.height / 2)
    ctx.stroke()
    ctx.setLineDash([])

    ctx.fillStyle = "white"
    ctx.strokeStyle = "white"
    ctx.lineWidth = 2
    const currentLine = gameState.currentLine
    let prevWinProb: number
    let indexCurrentMove: number
    const markers = []
    const denom = getDenom()
    ctx.beginPath()
    for (let i = 0, j = currentLine.length - 1; j >= 0; ++i, --j) {
      const l = currentLine[j]
      if (l === gameState.currentNode) indexCurrentMove = i
      let winProb = 0.5
      const outcome = chessFromFen(l.data.fen).outcome()
      let markerFill: string
      let markerStroke: string
      if (outcome) {
        markerFill = outcome.winner ?? "grey"
        winProb = outcome.winner === "white" ? 1 : outcome.winner === "black" ? 0 : 0.5
      } else {
        const e = scoreWhitePov(l.data.turn, l.data.eval)
        if (!e) {
          prevWinProb = undefined
          continue
        }
        winProb = e.type === "mate" ? (e.value >= 0 ? 1 : 0) : cpToWinProb(e.value)
      }
      const x = (i / denom) * canvas.width
      const y = 5 + (1 - winProb) * (canvas.height - 10)
      ctx.lineTo(x, y)
      if (prevWinProb !== undefined) {
        const delta = Math.abs(winProb - prevWinProb)
        if (delta > moveQualities.mistake.threshold) {
          markerFill = moveQualities.blunder.color
          markerStroke = "pink"
        } else if (delta > moveQualities.inaccuracy.threshold) {
          markerFill = moveQualities.mistake.color
          markerStroke = "#ec8"
        }
        if (markerFill) {
          markers.push({
            fill: markerFill,
            stroke: markerStroke,
            x,
            y
          })
        }
      }
      prevWinProb = winProb
    }
    ctx.stroke()

    for (const marker of markers) {
      ctx.beginPath()
      ctx.arc(marker.x, marker.y, 5, 0, 2 * Math.PI)
      ctx.fillStyle = marker.fill
      ctx.fill()
      ctx.strokeStyle = marker.stroke ?? "white"
      ctx.stroke()
    }

    // Draw line at current move
    ctx.lineWidth = 5
    ctx.strokeStyle = gameState.isMainline ? mainlineColor : variationColor
    ctx.beginPath()
    const x = Math.round((indexCurrentMove / denom) * canvas.width)
    ctx.moveTo(x, 0)
    ctx.lineTo(x, canvas.height)
    ctx.stroke()
  }

  function handleClick(e: MouseEvent) {
    const x = e.offsetX
    const currentLine = gameState.currentLine
    const index = Math.max(
      0,
      Math.min(currentLine.length - 1, currentLine.length - 1 - Math.round((x / canvas.width) * getDenom()))
    )
    gameState.currentNode = gameState.currentLine[index]
  }

  onMount(() => {
    ctx = canvas.getContext("2d")
    ctx.imageSmoothingQuality = "high"

    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const { width, height } = entry.contentRect
        canvas.width = width
        canvas.height = height
        draw()
      }
    })

    resizeObserver.observe(canvas)

    $effect(() => {
      draw()
    })

    return () => {
      resizeObserver.disconnect()
    }
  })
</script>

<div
  class="h-full relative border rounded-sm"
  style="border-color: {gameState.isMainline ? mainlineColor : variationColor};"
>
  <canvas
    bind:this={canvas}
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
    class="absolute w-full h-full"
  ></canvas>
</div>
