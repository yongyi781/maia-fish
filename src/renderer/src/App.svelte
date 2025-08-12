<script lang="ts">
  import type { DrawShape } from "chessground/draw"
  import type { Key } from "chessground/types"
  import { makeSquare, type NormalMove } from "chessops"
  import { parseFen } from "chessops/fen"
  import { makePgn, parsePgn } from "chessops/pgn"
  import { onMount, untrack } from "svelte"
  import "./app.css"
  import Chessboard from "./components/Chessboard.svelte"
  import EvalBar from "./components/EvalBar.svelte"
  import EvalGraph from "./components/EvalGraph.svelte"
  import Infobox from "./components/Infobox.svelte"
  import MoveList from "./components/MoveList.svelte"
  import Score from "./components/Score.svelte"
  import { config } from "./config.svelte"
  import { Engine } from "./engine.svelte"
  import { fromPgnNode, gameState, humanProbability, Node } from "./game.svelte"
  import { preprocess, processOutputs } from "./maia-utils"
  import {
    allLegalMoves,
    chessFromFen,
    existsBrilliantMove,
    formatScore,
    isTextFocused,
    moveQualities,
    moveQuality,
    randomChoice,
    randomWeightedChoice,
    parseUci,
    nagToSymbol,
    nagToColor
  } from "./utils"

  let chessboard: Chessboard
  let evalBar: EvalBar
  /** Reactive orientation variable for the eval bar. */
  let orientation: "white" | "black" = $state("white")
  const engine = new Engine()
  /** A timeout for debouncing engine commands. */
  // let pendingEngineTimeout: NodeJS.Timeout

  function handleCurrentNodeChanged() {
    const data = gameState.currentNode.data
    gameState.chess = chessFromFen(data.fen)
    let lastMove: NormalMove | undefined
    if (data.lan) {
      lastMove = parseUci(data.lan)
    }
    chessboard?.load(gameState.chess, lastMove)
    // Populate Maia evaluations
    const analyses = data.moveAnalyses
    if (analyses.length !== 0 && analyses[0][1].maiaProbability === undefined) populateMaiaProbabilities()
    engine.updatePosition(gameState.root.data.fen, gameState.currentNode.movesFromRootUci())
  }

  function handleWheel(e: WheelEvent) {
    e.preventDefault()
    if (e.deltaY > 0) {
      gameState.forward()
    } else if (e.deltaY < 0) {
      gameState.back()
    }
  }

  function deleteCurrentNode() {
    const parent = gameState.currentNode.data.parent
    if (parent) {
      parent.children = parent.children.filter((c) => c !== gameState.currentNode)
      gameState.currentNode = parent
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (isTextFocused()) return
    switch (e.key) {
      case " ":
        e.preventDefault()
        engine.toggleAnalyze()
        break
      case "ArrowLeft":
        gameState.back()
        break
      case "ArrowRight":
        gameState.forward()
        break
      case "Delete":
        deleteCurrentNode()
        break
      case "h":
        config.value.humanSort = !config.value.humanSort
        break
      case "w":
        config.value.hideLinesForWhite = !config.value.hideLinesForWhite
        break
      case "b":
        config.value.hideLinesForBlack = !config.value.hideLinesForBlack
        break
      case "F12":
        engine.autoMode = e.shiftKey ? "backward" : "forward"
        engine.go()
        break
    }
  }

  /** Triggers: `gameState.currentNode` and `config.value`. */
  $effect(() => {
    gameState.currentNode.fetchLichessStats()
  })

  /** Evaluates the position with Maia. */
  async function populateMaiaProbabilities() {
    const currentNode = gameState.currentNode
    const { boardInput, eloSelfCategory, eloOppoCategory, legalMoves } = preprocess(currentNode.data.fen, 1900, 1900)
    const { logits_maia, logits_value } = await window.api.analyzeMaia({
      boardInput,
      eloSelfCategory,
      eloOppoCategory
    })
    const outputs = processOutputs(currentNode.data.fen, logits_maia, logits_value, legalMoves)
    for (let [lan, a] of currentNode.data.moveAnalyses) {
      a.maiaProbability = outputs.policy[lan]
    }
  }

  function loadFen(fen: string) {
    gameState.game = {
      headers: new Map([
        ["Event", "World Chess Championship"],
        ["White", "Stockfish"],
        ["Black", "Magnus Carlsen"],
        ["FEN", fen]
      ]),
      moves: new Node({ fen: fen })
    }
    gameState.currentNode = gameState.game.moves
    evalBar.reset()
  }

  function analysisNumber(key: string, f: (x: any) => string = (x) => x) {
    const data = gameState.currentNode.data.moveAnalyses
      .filter((a) => a[1][key] !== undefined)
      .map((a) => a[1][key]) as number[]
    if (data.length > 0) {
      return f(data[0])
    }
  }

  function title() {
    const appName = "Maia Fish"
    let detail = ""
    const white = gameState.game.headers.get("White")
    const black = gameState.game.headers.get("Black")
    if (white && black) detail = `${white} vs ${black}`
    if (engine.analyzing) detail += " (Analyzing...)"
    return detail.length === 0 ? appName : `${appName} - ${detail}`
  }

  /** Loads a FEN or PGN. */
  async function loadFenOrPgn(text: string) {
    const setup = parseFen(text)
    if (setup.isOk) {
      loadFen(text)
    } else {
      const pgns = parsePgn(text)
      if (pgns.length < 0) throw new Error("Invalid PGN")
      const headerFen = pgns[0].headers.get("FEN")
      if (headerFen) loadFen(headerFen)
      gameState.game = {
        headers: pgns[0].headers,
        moves: fromPgnNode(pgns[0].moves, pgns[0].headers.get("FEN"))
      }
      gameState.currentNode = gameState.game.moves
    }
    await engine.stop()
    engine.newGame()
  }

  /** Copies the PGN to the clipboard. */
  function copyPgnToClipboard(e: any) {
    if (isTextFocused()) return
    e.preventDefault()
    const pos = chessFromFen(gameState.root.end().data.fen)
    const winner = pos.outcome()?.winner
    if (winner) {
      gameState.game.headers.set("Result", winner === "white" ? "1-0" : "0-1")
    } else {
      gameState.game.headers.delete("Result")
    }
    const pgn = makePgn(gameState.game)
    e.clipboardData.setData("text/plain", pgn)
  }

  /** Main position changed handler. */
  $effect(() => {
    gameState.currentNode
    untrack(() => {
      handleCurrentNodeChanged()
    })
  })

  /** Compute shapes */
  $effect(() => {
    const currentNode = gameState.currentNode
    const currentData = currentNode.data
    const shapes: DrawShape[] = []

    // Individual move quality
    const nag = currentData.engineNag
    if (nagToColor[nag]) {
      shapes.push({
        orig: currentData.lan.slice(2, 4) as Key,
        label: { text: nagToSymbol[nag], fill: nagToColor[nag] }
      })
    }

    if (!(currentData.turn === "w" ? config.value?.hideLinesForWhite : config.value?.hideLinesForBlack)) {
      // Actual move
      if (currentNode.children.length > 0) {
        const child = currentNode.children[0]
        const move = parseUci(child.data.lan)
        shapes.push({
          orig: makeSquare(move.from) as Key,
          dest: makeSquare(move.to) as Key,
          brush: "white",
          modifiers: { hilite: true }
        })
      }

      // Top engine move
      const topEngineUcis = currentData.topEngineMovesUci
      for (let uci of topEngineUcis) {
        const topMove = parseUci(uci)
        const shape: DrawShape = {
          orig: makeSquare(topMove.from),
          dest: makeSquare(topMove.to),
          brush: "paleBlue"
        }
        if (existsBrilliantMove(currentData)) {
          shape.label = { text: "!!", fill: moveQualities.best.color }
        }
        shapes.push(shape)
      }

      // Top human move
      const topHumanUci = currentData.topHumanMoveUci
      if (topHumanUci) {
        const topMove = parseUci(topHumanUci)
        const score = currentData.moveAnalyses[currentData.lanToIndex.get(topHumanUci)][1].score
        const best = currentData.eval
        const shape: DrawShape = {
          orig: makeSquare(topMove.from),
          dest: makeSquare(topMove.to),
          brush: "paleRed"
        }
        if (score !== undefined && best !== undefined) {
          const q = moveQuality(score, best)
          if (q.threshold >= 0.1 && q.threshold < 9000) {
            shape.label = { text: q.annotation, fill: q.color }
          }
        }
        shapes.push(shape)
      }
    }

    chessboard.setAutoShapes(shapes)
  })

  /** Eval bar. */
  $effect(() => {
    const data = gameState.currentNode.data
    evalBar.update(data.turn, data.eval)
  })

  /** Persisting config. */
  $effect(() => {
    window.api.config.set($state.snapshot(config.value))
  })

  onMount(() => {
    gameState.currentNode = gameState.game.moves

    window.electron.ipcRenderer.on("newGame", () => {
      gameState.game = {
        headers: new Map([
          ["Event", "World Chess Championship"],
          ["White", "Stockfish"],
          ["Black", "Magnus Carlsen"]
        ]),
        moves: new Node()
      }
      gameState.currentNode = gameState.game.moves
      evalBar.reset()
      engine.newGame()
    })

    window.electron.ipcRenderer.on("gotoRoot", () => {
      gameState.currentNode = gameState.game.moves
    })

    window.electron.ipcRenderer.on("gotoEnd", () => {
      gameState.currentNode = gameState.currentNode.end()
    })

    window.electron.ipcRenderer.on("prevVariation", () => {
      const node = gameState.currentNode
      if (node.isRoot()) return
      const siblings = node.data.parent.children
      const i = siblings.indexOf(node)
      gameState.currentNode = siblings[(i + siblings.length - 1) % siblings.length]
    })

    window.electron.ipcRenderer.on("nextVariation", () => {
      const node = gameState.currentNode
      if (node.isRoot()) return
      const siblings = node.data.parent.children
      const i = siblings.indexOf(node)
      gameState.currentNode = siblings[(i + 1) % siblings.length]
    })

    window.electron.ipcRenderer.on("returnToMainline", () => {
      let node = gameState.currentNode
      let res = node
      while (!node.isRoot()) {
        if (node.data.parent.children[0] !== node) {
          res = node.data.parent
        }
        node = node.data.parent
      }
      gameState.currentNode = res
    })

    window.electron.ipcRenderer.on("promoteToMainline", () => {
      let node = gameState.currentNode
      while (!node.isRoot()) {
        const siblings = node.data.parent.children
        const i = siblings.indexOf(node)
        if (i > 0) {
          siblings.splice(i, 1)
          siblings.unshift(node)
        }
        node = node.data.parent
      }
    })

    window.electron.ipcRenderer.on("deleteNode", deleteCurrentNode)

    window.electron.ipcRenderer.on("deleteOtherLines", () => {
      if (isTextFocused()) return
      let node = gameState.currentNode.end()
      let parent = node.data.parent
      while (parent) {
        parent.children = parent.children.filter((c) => c === node)
        node = parent
        parent = parent.data.parent
      }
    })

    window.electron.ipcRenderer.on("flipBoard", () => {
      if (isTextFocused()) return
      chessboard?.toggleOrientation()
      orientation = chessboard.getState().orientation
    })

    window.electron.ipcRenderer.on("forgetAnalysis", async () => {
      await engine.stop()
      gameState.currentNode.data.resetAnalysis()
    })

    window.electron.ipcRenderer.on("playTopEngineMove", () => {
      const moves = gameState.currentNode.data.topEngineMovesUci
      if (moves.length > 0) gameState.makeMove(parseUci(moves[0]))
    })

    window.electron.ipcRenderer.on("playTopHumanMove", () => {
      const move = gameState.currentNode.data.topHumanMoveUci
      if (move) gameState.makeMove(parseUci(move))
    })

    window.electron.ipcRenderer.on("playWeightedHumanMove", () => {
      const entries = gameState.currentNode.data.moveAnalyses.filter((a) => humanProbability(a[1]) !== undefined)
      if (entries.length === 0) return
      const moves: [string, number][] = entries.map((a) => [a[0], humanProbability(a[1])])
      const move = randomWeightedChoice(moves)
      gameState.makeMove(parseUci(move))
    })

    window.electron.ipcRenderer.on("playRandomMove", () => {
      gameState.makeMove(randomChoice(allLegalMoves(gameState.chess)))
    })

    return () => {
      window.electron.ipcRenderer.removeAllListeners(undefined)
    }
  })
</script>

<svelte:window
  onkeydown={handleKeyDown}
  ondragover={(e) => e.preventDefault()}
  ondrop={async (e) => {
    const file = e.dataTransfer?.files?.[0]
    if (file) {
      e.preventDefault()
      loadFenOrPgn(await file.text())
    }
  }}
  oncopy={copyPgnToClipboard}
  onpaste={async (e) => {
    if (isTextFocused()) return
    const text = e.clipboardData?.getData("text/plain")
    if (text) {
      e.preventDefault()
      loadFenOrPgn(text)
    }
  }}
  onbeforeunload={() => {
    engine.stop()
  }}
/>

<svelte:head><title>{title()}</title></svelte:head>

<!-- Main layout -->
<div class="flex h-screen flex-col p-1">
  <div class="flex gap-1">
    <!-- Left -->
    <div class="w-[576px]">
      <Chessboard
        class="cg-default-style"
        bind:this={chessboard}
        onmove={(move) => gameState.makeMove(move)}
        onwheel={handleWheel}
      />
    </div>
    <EvalBar bind:this={evalBar} {orientation} />
    <!-- Right -->
    <div class="flex max-h-[576px] flex-1 flex-col gap-2 p-1">
      <button
        class="flex h-20 cursor-pointer items-center gap-3 rounded-xs outline transition-colors {engine.analyzing
          ? 'bg-green-950 outline-green-900'
          : ' outline-zinc-700'}"
        title="Shortcut: Space"
        onclick={() => {
          engine.toggleAnalyze()
        }}
      >
        {#if gameState.chess.isEnd()}
          <div class="w-full text-3xl font-bold text-amber-200">
            {#if gameState.chess.isCheckmate()}
              Checkmate, {gameState.currentNode.data.turn === "w" ? "black" : "white"} wins
            {:else if gameState.chess.isInsufficientMaterial()}
              Insufficient material
            {:else if gameState.chess.isStalemate()}
              Stalemate
            {/if}
          </div>
        {:else if !engine.analyzing && !gameState.currentNode.data.moveAnalyses[0]?.[1].depth}
          <div class="w-full text-3xl font-bold">Analyze</div>
        {:else}
          <div class="w-24 text-center text-3xl font-bold text-nowrap">
            {formatScore(gameState.currentNode.data.turn, gameState.currentNode.data.eval)}
          </div>
          <div>
            <div class="text-gray-500">Human:</div>
            <Score
              score={gameState.currentNode.data.humanEval}
              best={gameState.currentNode.data.eval}
              turn={gameState.currentNode.data.turn}
            />
          </div>
          <div>
            <div class="text-gray-500">Nodes:</div>
            {analysisNumber("nodes", (x) => `${(x / 1000000).toFixed(1)}M`)}
          </div>
          <div>
            <div class="text-gray-500">Time:</div>
            {analysisNumber("time", (x) => `${(x / 1000).toFixed(1)}s`)}
          </div>
          <div>
            <div class="text-gray-500">N/s:</div>
            {analysisNumber("nps", (x) => `${(x / 1000000).toFixed(1)}M`)}
          </div>
          <div>
            <div class="text-gray-500">Hash:</div>
            {analysisNumber("hashfull", (x) => `${(x / 10).toFixed(1)}%`)}
          </div>
        {/if}
      </button>
      <div class="flex h-1/2 flex-1/2 shrink-0 flex-col rounded-sm outline outline-zinc-700">
        <div class="flex items-center justify-center gap-6 p-2">
          <div class="flex items-center gap-2" title="Shortcut: H">
            <input type="checkbox" id="checkbox1" bind:checked={config.value.humanSort} />
            <label for="checkbox1">Sort human</label>
          </div>
          <div class="flex items-center gap-2" title="Shortcut: W">
            <input type="checkbox" id="checkbox2" bind:checked={config.value.hideLinesForWhite} />
            <label for="checkbox2">Hide white lines</label>
          </div>
          <div class="flex items-center gap-2" title="Shortcut: B">
            <input type="checkbox" id="checkbox3" bind:checked={config.value.hideLinesForBlack} />
            <label for="checkbox3">Hide black lines</label>
          </div>
        </div>
        <hr class="mx-1 text-zinc-700" />
        <!-- Infobox -->
        <div class="flex-1">
          <Infobox data={gameState.currentNode.data} />
        </div>
      </div>
      <div class="flex justify-center gap-3">
        <div class="flex items-center gap-2">
          <label for="depth" class="text-sm text-zinc-400 dark:text-zinc-500">Depth</label>
          <input
            type="number"
            value={config.value.autoAnalyzeDepthLimit}
            min="0"
            oninput={(e) => (config.value.autoAnalyzeDepthLimit = Number(e.currentTarget.value))}
            class="w-16 rounded-md px-2 py-1 outline outline-zinc-800 dark:border-zinc-600"
          />
        </div>
        <div class="flex items-center justify-center gap-0">
          <button
            class="rounded-l-md px-2 py-1 {engine.autoMode === 'backward'
              ? 'bg-[#555577]'
              : 'bg-[#1a202c] hover:bg-[#333355]'} outline outline-zinc-800 transition-colors dark:outline-zinc-600"
            title="Shortcut: Shift+F12"
            onclick={() => (engine.autoMode = engine.autoMode === "backward" ? "off" : "backward")}
          >
            ◀◀
          </button>
          <button
            class="rounded-r-md px-2 py-1 {engine.autoMode === 'forward'
              ? 'bg-[#555577]'
              : 'bg-[#1a202c] hover:bg-[#333355]'} outline outline-zinc-800 transition-colors dark:outline-zinc-600"
            title="Shortcut: F12"
            onclick={() => (engine.autoMode = engine.autoMode === "forward" ? "off" : "forward")}
          >
            ▶▶
          </button>
        </div>
      </div>
      <div class="flex-1/2 overflow-auto rounded-sm p-1 outline outline-zinc-700">
        <!-- Move list root -->
        <MoveList />
      </div>
    </div>
  </div>
  <div class="flex items-center gap-x-3 p-2">
    <label for="fen">FEN</label>
    <input
      id="fen"
      class="w-[500px] font-mono"
      type="text"
      value={gameState.currentNode.data.fen}
      onfocus={(e) => {
        e.currentTarget.select()
      }}
      onkeydown={(e) => {
        if (e.key === "Enter") {
          loadFen(e.currentTarget.value)
          e.currentTarget.blur()
        }
      }}
    />
  </div>
  <div class="h-full"><EvalGraph onwheel={handleWheel} /></div>
</div>
