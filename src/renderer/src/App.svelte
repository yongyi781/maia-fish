<script lang="ts">
  import type { DrawShape } from "chessground/draw"
  import type { Key } from "chessground/types"
  import { Chess, fen, makeSquare, makeUci, type NormalMove, parseUci } from "chessops"
  import { makeFen, parseFen } from "chessops/fen"
  import { makePgn, parsePgn } from "chessops/pgn"
  import { makeSanAndPlay } from "chessops/san"
  import { onMount, untrack } from "svelte"
  import "./app.css"
  import Chessboard from "./components/Chessboard.svelte"
  import EvalBar from "./components/EvalBar.svelte"
  import EvalGraph from "./components/EvalGraph.svelte"
  import Infobox from "./components/Infobox.svelte"
  import MoveListNode from "./components/MoveListNode.svelte"
  import Score from "./components/Score.svelte"
  import { fromPgnNode, gameState, Node, NodeData } from "./game.svelte"
  import { preprocess, processOutputs } from "./maia-utils"
  import {
    allLegalMoves,
    chessFromFen,
    formatScore,
    moveQualities,
    moveQuality,
    parseUciInfo,
    pvUciToSan,
    randomChoice,
    randomWeightedChoice
  } from "./utils"

  let chess = $state(Chess.default())
  let chessboard: Chessboard = $state()
  let evalBar: EvalBar
  const initialFen = $derived(gameState.game.moves.data.fen ?? fen.INITIAL_FEN)
  const fenStr = $derived(gameState.currentNode.data.fen ?? initialFen)
  /** Whether we are analyzing. */
  let analyzing = $state(false)
  let orientation: "white" | "black" = $state("white")
  /** The engine's actual status. */
  let engineStatus: "stopped" | "running" = "stopped"
  /** Whether we are currently changing the position. */
  let positionChanging = false
  /** A timeout for debouncing engine commands. */
  // let pendingEngineTimeout: NodeJS.Timeout

  /** Updates the engine position. */
  function updateEnginePosition() {
    let shouldStartEngine = false
    if (analyzing) {
      positionChanging = true
      if (engineStatus === "running") {
        window.api.sendEngineCommand("stop")
      } else {
        shouldStartEngine = true
        positionChanging = false
      }
    }
    let command = `position ${initialFen === fen.INITIAL_FEN ? "startpos" : "fen " + initialFen}`
    const moves = gameState.currentNode.movesFromRoot()
    if (moves.length > 0) command += ` moves ${moves}`
    window.api.sendEngineCommand(command)
    if (shouldStartEngine) {
      window.api.sendEngineCommand("go")
      engineStatus = "running"
    }
  }

  function onPositionChanged() {
    chess = chessFromFen(gameState.currentNode.data.fen)
    let lastMove: NormalMove | undefined
    if (gameState.currentNode.data.lan) {
      lastMove = parseUci(gameState.currentNode.data.lan) as NormalMove
    }
    chessboard?.load(chess, lastMove)
    // Populate Maia evaluations
    const analyses = gameState.currentNode.data.moveAnalyses
    if (analyses.length === 0 || analyses[0][1].humanProbability === undefined) staticEval()
    // Change engine position
    updateEnginePosition()
  }

  /** Performs a move. */
  function makeMove(m: NormalMove) {
    const san = makeSanAndPlay(chess, m)
    if (!san) {
      console.error("Invalid SAN in makeMove")
      return
    }
    const lan = makeUci(m)
    let exists = false
    for (let c of gameState.currentNode.children)
      if (c.data.san === san) {
        gameState.currentNode = c
        exists = true
        break
      }
    if (!exists) {
      const child = new Node({
        fen: makeFen(chess.toSetup()),
        lan: lan,
        san: san,
        parent: gameState.currentNode
      })
      gameState.currentNode.children.push(child)
      gameState.currentNode = child
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === " ") {
      const ae = document.activeElement
      if (ae.tagName !== "INPUT" && ae.tagName !== "TEXTAREA" && !ae["isContentEditable"]) {
        e.preventDefault()
        handleAnalyzeClicked()
      }
    } else if (e.key === "c") {
      chessboard.setAutoShapes([
        {
          orig: "d5",
          label: { text: "?!", fill: "red" }
        }
      ])
    }
  }

  async function handleAnalyzeClicked() {
    if (analyzing) {
      analyzing = false
      window.api.sendEngineCommand("stop")
    } else {
      analyzing = true
      window.api.sendEngineCommand("go")
      engineStatus = "running"
    }
  }

  async function fetchLichessStats() {}

  /** Evaluates the position with Maia. */
  async function staticEval() {
    const currentNode = gameState.currentNode
    const { boardInput, eloSelfCategory, eloOppoCategory, legalMoves } = preprocess(currentNode.data.fen, 1900, 1900)
    const { logits_maia, logits_value } = await window.api.analyzeMaia({
      boardInput,
      eloSelfCategory,
      eloOppoCategory
    })
    const outputs = processOutputs(fenStr, logits_maia, logits_value, legalMoves)
    for (let [lan, a] of currentNode.data.moveAnalyses) {
      a.humanProbability = outputs.policy[lan]
    }
  }

  /** Main method to process Stockfish output */
  function processEngineOutput(line: string) {
    try {
      if (!positionChanging && line.startsWith("info depth") && line.includes(" pv ")) {
        const info = parseUciInfo(line)
        if (!info || !info.pv) {
          console.error("PV missing?", line)
          return
        }
        const lan = info.pv[0]
        const entry = gameState.currentNode.data.moveAnalyses.find((m) => m[0] === lan)
        // Write only if depth >= max(6, current depth)
        if (entry && info.depth >= (entry[1].depth || 6)) {
          // Convert the PV to SAN.
          info.pv = pvUciToSan(chess, info.pv)
          Object.assign(entry[1], info)
        }
      } else if (line.startsWith("bestmove")) {
        // "bestmove" = engine stopped.
        if (analyzing) {
          if (positionChanging) {
            // Debounce
            // clearTimeout(pendingEngineTimeout)
            positionChanging = false
            window.api.sendEngineCommand("go")
            engineStatus = "running"
          } else {
            // Stopped on its own (e.g. exhausted the tree).
            engineStatus = "stopped"
          }
        }
      }
    } catch (error) {
      throw error
    }
  }

  function goForward() {
    if (gameState.currentNode.children.length > 0) gameState.currentNode = gameState.currentNode.children[0]
  }

  function goBack() {
    if (!gameState.currentNode.isRoot()) gameState.currentNode = gameState.currentNode.data.parent
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
    const appName = "Nibbler2"
    let detail = ""
    const white = gameState.game.headers.get("White")
    const black = gameState.game.headers.get("Black")
    if (white && black) detail = `${white} vs ${black}`
    if (analyzing) detail += " (Analyzing...)"
    return detail.length === 0 ? appName : `${appName} - ${detail}`
  }

  /**
   * Checks there exists a brilliant move. The requirements are:
   * - The position is not super-losing (i.e. cp >= -500)
   * - Every human move with ≥ 3% probability is an inaccuracy or worse.
   */
  function existsBrilliantMove(data: NodeData, humanProbThreshold = 0.03) {
    const best = data.eval
    // If the position is super-losing (cp < -500) then there can't be a brilliant move.
    if (best === undefined || (best.type === "mate" && best.value < 0) || best.value < -500) return false
    const hasObviousGoodMove = data.moveAnalyses.some(
      ([, a]) =>
        a.humanProbability >= humanProbThreshold &&
        (a.score === undefined || moveQuality(a.score, best).threshold < 0.1)
    )
    return !hasObviousGoodMove
  }

  $effect(() => {
    gameState.currentNode
    untrack(() => {
      onPositionChanged()
    })
  })

  /** Compute shapes */
  $effect(() => {
    const currentData = gameState.currentNode.data
    const shapes: DrawShape[] = []

    // Individual move quality
    const parent = currentData.parent
    if (parent && parent.data.eval) {
      const a = parent.data.moveAnalyses.find((m) => m[0] === currentData.lan)
      if (a && a[1].score) {
        const q = moveQuality(a[1].score, parent.data.eval)
        if (q.threshold === 0) {
          if (existsBrilliantMove(parent.data)) {
            shapes.push({
              orig: currentData.lan.slice(2, 4) as Key,
              label: { text: "!!", fill: q.color }
            })
          }
        } else if (q.threshold >= 0.1 && q.threshold < 9000) {
          shapes.push({
            orig: currentData.lan.slice(2, 4) as Key,
            label: { text: q.annotation, fill: q.color }
          })
        }
      }
    }

    const topEngineUcis = currentData.topEngineMovesUci
    for (let uci of topEngineUcis) {
      const topMove = parseUci(uci) as NormalMove
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

    const topHumanUci = currentData.topHumanMoveUci
    if (topHumanUci) {
      const topMove = parseUci(topHumanUci) as NormalMove
      const score = currentData.moveAnalyses.find((m) => m[0] === topHumanUci)[1].score
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

    chessboard.setAutoShapes(shapes)
  })

  $effect(() => {
    evalBar.update(gameState.currentNode.data.turn, gameState.currentNode.data.eval)
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
      window.api.sendEngineCommand("stop\nucinewgame")
    })

    window.electron.ipcRenderer.on("copyFenPgn", () => {
      const pos = chessFromFen(gameState.root.end().data.fen)
      const winner = pos.outcome()?.winner
      if (winner) {
        gameState.game.headers.set("Result", winner === "white" ? "1-0" : "0-1")
      } else {
        gameState.game.headers.delete("Result")
      }
      const pgn = makePgn(gameState.game)
      window.api.writeToClipboard(pgn)
    })

    window.electron.ipcRenderer.on("pasteFenPgn", (_, [text]: string[]) => {
      const setup = parseFen(text)
      if (setup.isOk) {
        loadFen(text)
      } else {
        const pgns = parsePgn(text)
        if (pgns.length < 0) throw new Error("Invalid PGN")
        gameState.game = {
          headers: pgns[0].headers,
          moves: fromPgnNode(pgns[0].moves)
        }
        gameState.currentNode = gameState.game.moves
      }
      window.api.sendEngineCommand("stop\nucinewgame")
    })

    window.electron.ipcRenderer.on("gotoRoot", () => {
      gameState.currentNode = gameState.game.moves
    })

    window.electron.ipcRenderer.on("gotoEnd", () => {
      gameState.currentNode = gameState.currentNode.end()
    })

    window.electron.ipcRenderer.on("goBack", () => {
      goBack()
    })

    window.electron.ipcRenderer.on("goForward", () => {
      goForward()
    })

    window.electron.ipcRenderer.on("deleteNode", () => {
      const parent = gameState.currentNode.data.parent
      if (parent) {
        parent.children = parent.children.filter((c) => c !== gameState.currentNode)
        gameState.currentNode = parent
      }
    })

    window.electron.ipcRenderer.on("deleteOtherLines", () => {
      let node = gameState.currentNode.end()
      let parent = node.data.parent
      while (parent) {
        parent.children = parent.children.filter((c) => c === node)
        node = parent
        parent = parent.data.parent
      }
    })

    window.electron.ipcRenderer.on("flipBoard", () => {
      chessboard?.toggleOrientation()
      orientation = chessboard.getState().orientation
    })

    window.electron.ipcRenderer.on("playTopEngineMove", () => {
      const moves = gameState.currentNode.data.topEngineMovesUci
      if (moves.length > 0) makeMove(parseUci(moves[0]) as NormalMove)
    })

    window.electron.ipcRenderer.on("playTopHumanMove", () => {
      const move = gameState.currentNode.data.topHumanMoveUci
      if (move) makeMove(parseUci(move) as NormalMove)
    })

    window.electron.ipcRenderer.on("playWeightedHumanMove", () => {
      const entries = gameState.currentNode.data.moveAnalyses.filter((a) => a[1].humanProbability !== undefined)
      if (entries.length === 0) return
      const moves: [string, number][] = entries.map((a) => [a[0], a[1].humanProbability])
      const move = randomWeightedChoice(moves)
      makeMove(parseUci(move) as NormalMove)
    })

    window.electron.ipcRenderer.on("playRandomMove", () => {
      makeMove(randomChoice(allLegalMoves(chess)))
    })

    window.electron.ipcRenderer.on("stockfish-output", (_, output: string) => {
      try {
        for (let line of output.split("\n")) processEngineOutput(line)
      } catch (error) {
        console.error(error)
      }
    })

    return () => {
      window.electron.ipcRenderer.removeAllListeners("newGame")
      window.electron.ipcRenderer.removeAllListeners("gotoRoot")
      window.electron.ipcRenderer.removeAllListeners("gotoEnd")
      window.electron.ipcRenderer.removeAllListeners("goBack")
      window.electron.ipcRenderer.removeAllListeners("goForward")
      window.electron.ipcRenderer.removeAllListeners("deleteNode")
      window.electron.ipcRenderer.removeAllListeners("deleteOtherLines")
      window.electron.ipcRenderer.removeAllListeners("flipBoard")
      window.electron.ipcRenderer.removeAllListeners("playWeightedHumanMove")
      window.electron.ipcRenderer.removeAllListeners("playTopHumanMove")
      window.electron.ipcRenderer.removeAllListeners("playRandomMove")
      window.electron.ipcRenderer.removeAllListeners("stockfish-output")
    }
  })
</script>

<svelte:window
  onkeydown={onKeyDown}
  onbeforeunload={() => {
    analyzing = false
    window.api.sendEngineCommand("stop")
  }}
/>

<svelte:head><title>{title()}</title></svelte:head>

<!-- Main layout -->
<div class="h-screen flex flex-col p-1">
  <div class="flex gap-1">
    <!-- Left -->
    <div
      class=" w-[576px]"
      onwheel={(e) => {
        e.preventDefault()
        if (e.deltaY > 0) {
          goForward()
        } else if (e.deltaY < 0) {
          goBack()
        }
      }}
    >
      <Chessboard bind:this={chessboard} onmove={makeMove} />
    </div>
    <EvalBar bind:this={evalBar} {orientation} />
    <!-- Right -->
    <div class="flex flex-1 gap-2 flex-col max-h-[576px]">
      <button
        class="flex p-1 h-16 items-center gap-3 outline transition-colors cursor-pointer rounded-xs {analyzing
          ? 'bg-green-950 outline-green-900'
          : ' outline-zinc-700'}"
        onclick={handleAnalyzeClicked}
      >
        {#if chess.isEnd()}
          <div class="font-bold text-3xl w-full text-amber-200">
            {#if chess.isCheckmate()}
              Checkmate, {gameState.currentNode.data.turn === "w" ? "black" : "white"} wins
            {:else if chess.isInsufficientMaterial()}
              Insufficient material
            {:else if chess.isStalemate()}
              Stalemate
            {/if}
          </div>
        {:else if !analyzing && !gameState.currentNode.data.moveAnalyses[0]?.[1].depth}
          <div class="font-bold text-3xl w-full">Analyze</div>
        {:else}
          <div class="font-bold text-3xl text-nowrap w-24 text-center">
            {formatScore(gameState.currentNode.data.turn, gameState.currentNode.data.eval)}
          </div>
          <div>
            <span class="text-gray-500">Human:</span>
            <Score
              score={gameState.currentNode.data.humanEval}
              best={gameState.currentNode.data.eval}
              turn={gameState.currentNode.data.turn}
            />
          </div>
          <div>
            <span class="text-gray-500">Nodes:</span>
            {analysisNumber("nodes", (x) => `${(x / 1000000).toFixed(1)}M`)}
          </div>
          <div>
            <span class="text-gray-500">Time:</span>
            {analysisNumber("time", (x) => `${(x / 1000).toFixed(1)}s`)}
          </div>
          <div>
            <span class="text-gray-500">N/s:</span>
            {analysisNumber("nps", (x) => `${(x / 1000000).toFixed(1)}M`)}
          </div>
          <div>
            <span class="text-gray-500">Hash:</span>
            {analysisNumber("hashfull", (x) => `${(x / 10).toFixed(1)}%`)}
          </div>
        {/if}
      </button>
      <div class=" flex-2/3 overflow-auto">
        <!-- Infobox -->
        <Infobox />
      </div>
      <div class="flex-1/3 overflow-auto">
        <!-- Move list root -->
        <div class="p-1 select-none flex flex-wrap max-h-full">
          <MoveListNode ply={0} node={gameState.game.moves} />
        </div>
      </div>
    </div>
  </div>
  <div class="flex items-center gap-x-3 p-2">
    <span>FEN</span>
    <input
      class="w-[500px] font-mono"
      type="text"
      value={fenStr}
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
  <div class="h-full"><EvalGraph /></div>
</div>
