<script lang="ts">
  import type { DrawShape } from "chessground/draw"
  import { Chess, fen, makeSquare, makeUci, type NormalMove, parseSquare, parseUci } from "chessops"
  import { makeFen, parseFen } from "chessops/fen"
  import { makePgn, parsePgn } from "chessops/pgn"
  import { makeSanAndPlay } from "chessops/san"
  import { onMount, untrack } from "svelte"
  import "./app.css"
  import Chessboard from "./components/Chessboard.svelte"
  import Infobox from "./components/Infobox.svelte"
  import MoveListNode from "./components/MoveListNode.svelte"
  import Score from "./components/Score.svelte"
  import { fromPgnNode, gameState, Node } from "./game.svelte"
  import { preprocess, processOutputs } from "./maia-utils"
  import {
    allLegalMoves,
    chessFromFen,
    formatScore,
    moveQuality,
    parseUciInfo,
    pvUciToSan,
    randomChoice,
    randomWeightedChoice
  } from "./utils"

  let chess = $state(Chess.default())
  let chessboard: Chessboard
  const initialFen = $derived(gameState.game.moves.data.fen ?? fen.INITIAL_FEN)
  const fenStr = $derived(gameState.currentNode.data.fen ?? initialFen)
  /** Whether we are analyzing. */
  let analyzing = $state(false)
  /** The engine's actual status. */
  let engineStatus: "stopped" | "running" = "stopped"
  /** Whether we are currently changing the position. */
  let positionChanging = false

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
    const analyses = Object.values(gameState.currentNode.data.moveAnalyses)
    if (analyses.length === 0 || analyses[0].humanProbability === undefined) staticEval()
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
        onAnalyzeClicked()
      }
    } else if (e.key === "c") {
      chessboard.setAutoShapes([])
    }
  }

  async function onAnalyzeClicked() {
    if (analyzing) {
      analyzing = false
      window.api.sendEngineCommand("stop")
    } else {
      analyzing = true
      window.api.sendEngineCommand("go")
      engineStatus = "running"
    }
  }

  async function fetchLichessStats() {
    let url: string = ""
  }

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
    for (let [lan, a] of Object.entries(currentNode.data.moveAnalyses)) {
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
        // Convert the PV to SAN.
        info.pv = pvUciToSan(chess, info.pv)
        Object.assign(gameState.currentNode.data.moveAnalyses[lan], info)
      } else if (line.startsWith("bestmove")) {
        // "bestmove" = engine stopped.
        if (analyzing) {
          if (positionChanging) {
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
  }

  function analysisNumber(key: string, f: (x: any) => string = (x) => x) {
    const data = Object.entries(gameState.currentNode.data.moveAnalyses)
      .filter((a) => a[1][key] !== undefined)
      .map((a) => a[1][key]) as number[]
    if (data.length > 0) {
      return f(data[0])
    }
  }

  $effect(() => {
    gameState.currentNode
    untrack(() => {
      onPositionChanged()
    })
  })

  $effect(() => {
    let shapes: DrawShape[] = []

    const topEngineUcis = gameState.currentNode.data.topEngineMovesUci
    for (let uci of topEngineUcis) {
      const topMove = parseUci(uci) as NormalMove
      shapes.push({
        orig: makeSquare(topMove.from),
        dest: makeSquare(topMove.to),
        brush: "paleBlue"
      })
    }

    const topHumanUci = gameState.currentNode.data.topHumanMoveUci
    if (topHumanUci) {
      const topMove = parseUci(topHumanUci) as NormalMove
      const score = gameState.currentNode.data.moveAnalyses[topHumanUci]?.score
      const best = gameState.currentNode.data.eval
      const shape: DrawShape = {
        orig: makeSquare(topMove.from),
        dest: makeSquare(topMove.to),
        brush: "paleRed"
      }
      if (score !== undefined && best !== undefined) {
        const q = moveQuality(score, best)
        shape.label = { text: q.annotation, fill: q.color }
      }
      shapes.push(shape)
    }
    chessboard.setAutoShapes(shapes)
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
      const entries = Object.entries(gameState.currentNode.data.moveAnalyses).filter(
        (a) => a[1].humanProbability !== undefined
      )
      if (entries.length === 0) return
      const moves: [string, number][] = entries.map((a) => [a[0], a[1].humanProbability])
      const move = randomWeightedChoice(moves)
      makeMove(parseUci(move) as NormalMove)
    })

    window.electron.ipcRenderer.on("playRandomMove", () => {
      makeMove(randomChoice(allLegalMoves(chess)))
    })

    window.electron.ipcRenderer.on("stockfish-output", (_, output: string) => {
      for (let line of output.split("\n")) processEngineOutput(line)
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

<!-- Main layout -->
<div class="h-screen flex flex-col gap-1 p-1">
  <div class="flex gap-2">
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
      <!-- Chessboard -->
      <Chessboard bind:this={chessboard} onmove={makeMove} />
    </div>
    <!-- Right -->
    <div class="flex flex-1 gap-2 flex-col max-h-[576px]">
      <div class="flex items-center gap-3">
        <button class="btn" onclick={onAnalyzeClicked}>{analyzing ? "Stop" : "Analyze"}</button>
        {#if chess.isEnd()}
          <div class="text-amber-200">
            {#if chess.isCheckmate()}
              Checkmate, {gameState.currentNode.data.turn === "w" ? "black" : "white"} wins
            {:else if chess.isInsufficientMaterial()}
              Insufficient material
            {:else if chess.isStalemate()}
              Stalemate
            {/if}
          </div>
        {:else}
          <div class="font-bold text-xl">
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
        {/if}
      </div>
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
  <div class="flex items-center gap-x-3">
    <span>FEN</span>
    <input
      class="w-[600px] font-mono"
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
  <div class="p-2 text-center">
    <button
      class="btn"
      onclick={() => {
        const f = chess.isLegal({ from: parseSquare("e8"), to: parseSquare("g8") })
        console.log(f)
      }}>Debug</button
    >
  </div>
</div>
