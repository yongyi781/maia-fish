import { Chess, fen, makeUci, type NormalMove, pgn } from "chessops"
import { makeFen } from "chessops/fen"
import { defaultHeaders } from "chessops/pgn"
import { makeSan, makeSanAndPlay, parseSan } from "chessops/san"
import type { Score } from "../../shared"
import { config } from "./config.svelte"
import { allLegalMoves, chessFromFen, classifyMove, existsBrilliantMove, normalizeMove, parseUci } from "./utils"

function makeLichessUrl(fen: string) {
  const url = new URL("https://explorer.lichess.ovh/lichess")
  const params = new URLSearchParams()
  params.append("variant", "standard")
  params.append("topGames", "0")
  params.append("recentGames", "0")
  if (config.value.lichessBookSpeeds) params.append("speeds", config.value.lichessBookSpeeds.toString())
  if (config.value.lichessBookRatings) params.append("ratings", config.value.lichessBookRatings.toString())
  params.append("fen", fen)
  url.search = params.toString()
  return url
}

/** Converts an `Score` to a raw evaluation, for comparison purposes. */
export function rawEval(e: Score | undefined) {
  if (!e) return -Infinity
  switch (e.type) {
    case "cp":
      return e.value
    case "mate":
      return e.value === 0 ? -36000 : Math.sign(e.value) * (36000 - Math.abs(e.value))
  }
}

/** Converts an `Score` to a raw evaluation, for comparison purposes. Clamps values, defaulting to an upper bound of 8
 *  pawns and a lower bound of -8 pawns. */
export function rawEvalClamped(e: Score | undefined, upperBound = 800) {
  if (!e) return -Infinity
  switch (e.type) {
    case "cp":
      return Math.max(-upperBound, Math.min(e.value, upperBound))
    case "mate":
      return e.value === 0 ? -upperBound : Math.sign(e.value) * (upperBound - Math.abs(e.value))
  }
}

/** Analysis associated with each legal move. */
export interface MoveAnalysis {
  /** List of moves in the PV, in SAN format. */
  pv: string[]
  depth?: number
  score?: Score
  maiaProbability?: number
  lichessProbability?: number
  /** Number of nodes searched in this analysis. */
  nodes?: number
  nps?: number
  /** Timestamp of the last update. For throttling. */
  lastUpdate?: DOMHighResTimeStamp
  [key: string]: unknown
}

export interface Opening {
  eco: string
  name: string
}

/** Returns the human probability of a move. If it's undefined, returns 0. */
export function humanProbability(a: MoveAnalysis) {
  return (a.lichessProbability !== undefined ? a.lichessProbability : a.maiaProbability) ?? 0
}

/**
 * Node data associated with a move as well as the resulting position. When parsing make sure you transform into class
 * instances.
 */
export class NodeData implements pgn.PgnNodeData {
  /** The move number in plies (half-moves). */
  moveNumber: number
  /** Short algebraic notation for the move. */
  san: string = ""
  /** Long algebraic notation for the move. */
  lan: string = ""
  /** The FEN string for the position. */
  fen: string = ""
  /** Side to move. */
  turn: "w" | "b"
  /** Legal move analyses: key is LAN, value iseval, depth, Maia policy, ... */
  moveAnalyses: [string, MoveAnalysis][] = $state([])
  /** Mapping from LAN to index in `moveAnalyses`. */
  lanToIndex = new Map<string, number>()
  /** The parent node. */
  parent?: Node
  startingComments?: string[]
  comments?: string[]
  nags?: number[]
  opening?: Opening = $state()

  constructor(data?: Partial<NodeData>) {
    Object.assign(this, data)
    if (!this.fen) {
      this.fen = fen.INITIAL_FEN
    }
    this.turn = this.fen.split(" ")[1] as "w" | "b"
    this.moveNumber = this.turn === "w" ? this.pos.fullmoves - 1 : this.pos.fullmoves
    this.resetAnalysis()
  }

  pos: Chess = $derived(chessFromFen(this.fen))

  /** Current position's evaluation. */
  eval = $derived(
    this.moveAnalyses.length === 0
      ? undefined
      : this.moveAnalyses.reduce((max, ma) =>
          ma !== undefined && rawEval(ma[1].score) > rawEval(max[1].score) ? ma : max
        )[1]?.score
  )

  /** Current position's human evaluation, in centipawns. */
  humanEval = $derived(
    this.moveAnalyses.length === 0
      ? undefined
      : ({
          type: "cp",
          value: this.moveAnalyses.reduce(
            (acc, [, ma]) => acc + rawEvalClamped(ma.score) * (humanProbability(ma) ?? 0),
            0
          )
        } as Score)
  )

  /** Gets the top human move according to the analysis. */
  topHumanMoveUci = $derived.by(() => {
    let res: string | undefined
    let maxProb = -Infinity
    for (const [uci, a] of this.moveAnalyses) {
      const p = humanProbability(a)
      if (p && p > maxProb) {
        res = uci
        maxProb = p
      }
    }
    return res
  })

  /** Gets the top engine move (multiple if tied) according to the analysis. */
  topEngineMovesUci = $derived.by(() => {
    const entries = this.moveAnalyses.filter((a) => a[1].score !== undefined)
    if (entries.length === 0) return []
    let res: string[] = []
    let bestScore = -Infinity
    for (const [uci, ma] of entries) {
      if (rawEval(ma.score) > bestScore) {
        res = [uci]
        bestScore = rawEval(ma.score)
      } else if (rawEval(ma.score) === bestScore) {
        res.push(uci)
      }
    }
    return res
  })

  /** The engine annotation based on this move's quality. */
  engineNag = $derived.by(() => {
    const p = this.parent
    if (!p || !p.data.eval) return 0
    const score = this.parentAnalysisEntry()?.score
    if (!score) return 0
    const c = classifyMove(score, p.data.eval)
    if (!c) return 0
    if (c === "best" && existsBrilliantMove(p.data)) return 3
    if (c === "inaccuracy") return 6
    if (c === "mistake") return 2
    if (c === "blunder") return 4
    return 0
  })

  /** Gets move analysis by LAN. */
  moveAnalysis(lan: string) {
    const index = this.lanToIndex.get(lan)
    if (index === undefined) return undefined
    return this.moveAnalyses[index][1]
  }

  /** Gets the move analysis corresponding to this node of the parent node. */
  parentAnalysisEntry() {
    return this.parent?.data.moveAnalysis(this.lan)
  }

  resetAnalysis() {
    if (this.moveAnalyses.length === 0) {
      this.moveAnalyses = allLegalMoves(this.pos).map((move): [string, MoveAnalysis] => {
        return [makeUci(move), { pv: [makeSan(this.pos, move)] }]
      })
      for (let i = 0; i < this.moveAnalyses.length; i++) {
        this.lanToIndex.set(this.moveAnalyses[i][0], i)
      }
    } else {
      for (const [move, a] of this.moveAnalyses) {
        a.depth = a.lastUpdate = a.nodes = a.nps = a.score = undefined
        a.pv = [makeSan(this.pos, parseUci(move))]
      }
    }
  }
}

/** Reactive version of `pgn.Node`. */
export class Node implements pgn.Node<NodeData> {
  children: Node[] = $state([])
  data: NodeData

  constructor(data?: Partial<NodeData>) {
    this.data = new NodeData(data)
  }

  *mainlineNodes(): Iterable<Node> {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let node: Node = this
    while (node.children.length) {
      const child = node.children[0]
      yield child
      node = child
    }
  }

  *mainline(): Iterable<NodeData> {
    for (const child of this.mainlineNodes()) yield child.data
  }

  end(): Node {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let node: Node = this
    while (node.children.length) node = node.children[0]
    return node
  }

  /** Returns the path from the root to this node. */
  pathToRoot(): Node[] {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let node: Node | undefined = this
    const res = []
    while (node) {
      res.push(node)
      node = node.data.parent
    }
    return res
  }

  /** Returns the moves from the root to this node. */
  movesFromRootUci(): string[] {
    const path = this.pathToRoot()
    path.reverse()
    path.shift()
    return path.map((n) => n.data.lan)
  }

  /** Adds a list of moves. */
  addMoves(moves: string[]) {
    const pos = chessFromFen(this.data.fen)
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let node: Node = this
    for (const san of moves) {
      const move = normalizeMove(pos, parseSan(pos, san) as NormalMove)
      if (!move) {
        console.warn(`Unexpected illegal move: ${san}`)
        continue
      }
      pos.play(move)
      let child = node.children.find((c) => c.data.san === san)
      if (!child) {
        child = new Node({
          fen: makeFen(pos.toSetup()),
          lan: makeUci(move),
          san: san,
          parent: node
        })
        node.children.push(child)
      }
      node = child
    }
    return node
  }

  async fetchLichessStats() {
    if (!config.value.lichessThreshold) return
    const data = this.data
    if (
      !config.value?.lichessBookSpeeds ||
      !config.value?.lichessBookRatings ||
      data.moveNumber > config.value.maiaBookPliesLimit ||
      data.moveAnalyses.length === 0 ||
      data.moveAnalyses.some((a) => a[1].lichessProbability !== undefined)
    )
      return
    const url = makeLichessUrl(data.fen)
    const response = await fetch(url)
    if (!response.ok) {
      console.warn("Failed to fetch lichess stats, falling back to Maia weights", response)
      return
    }
    interface MoveStatistic {
      uci: string
      white: number
      draws: number
      black: number
    }
    const json = (await response.json()) as { moves: MoveStatistic[]; opening: Opening }
    const totalGames = json.moves.reduce((a, b) => a + b.white + b.draws + b.black, 0)
    if (totalGames < config.value.lichessThreshold) return
    const pos = chessFromFen(data.fen)
    if (json.opening) data.opening = json.opening
    for (const [lan, a] of data.moveAnalyses) {
      const move = json.moves.find((m) => makeUci(normalizeMove(pos, parseUci(m.uci))) === lan)
      if (!move) a.lichessProbability = 0
      else a.lichessProbability = (move.white + move.draws + move.black) / totalGames
    }
  }
}

/** Converts a `pgn.Node` to a `Node`. */
export function fromPgnNode(pgnNode: pgn.Node<pgn.PgnNodeData>, initialFen: string | undefined) {
  const res = new Node({ fen: initialFen })
  const stack = [
    {
      before: pgnNode,
      after: res
    }
  ]
  while (stack.length > 0) {
    const { before, after } = stack.pop()!
    if (before) {
      const pos = chessFromFen(after.data.fen)
      for (const child of before.children) {
        const move = normalizeMove(pos, parseSan(pos, child.data.san) as NormalMove)
        if (move) {
          const pos2 = pos.clone()
          pos2.play(move)
          const newChild = new Node({
            ...child.data,
            fen: makeFen(pos2.toSetup()),
            lan: makeUci(move),
            parent: after
          })
          after.children.push(newChild)
          stack.push({ before: child, after: newChild })
        } else {
          console.warn(`Illegal move ignored: ${child.data.san}`)
        }
      }
    }
  }
  return res
}

export class GameState {
  /** The game tree, containing all data such as evals. */
  game = $state({
    headers: defaultHeaders(),
    moves: new Node()
  })
  /** The chess position. */
  chess = $state(Chess.default())
  /** The currently selected node. */
  currentNode = $state(new Node({}))
  maiaAutoMode: "white" | "black" | "off" = $state("off")

  /** The line containing the currently selected node. */
  currentLine = $derived(this.currentNode.end().pathToRoot())
  /** Nodes in the mainline. */
  mainline = $derived([...this.root.mainlineNodes()])
  /** Whether the currently selected node is in the mainline. */
  isMainline = $derived(this.currentNode === this.root || this.mainline.includes(this.currentNode))

  /** The root node. */
  get root() {
    return this.game.moves
  }

  /** Sets the current node due to user interaction. */
  userSetCurrentNode(node: Node) {
    this.maiaAutoMode = "off"
    this.currentNode = node
  }

  /** Performs a move. */
  makeMove(m: NormalMove) {
    const node = gameState.currentNode
    const san = makeSanAndPlay(this.chess, m)
    if (!san) {
      throw new Error("Invalid SAN in makeMove")
    }
    const lan = makeUci(m)
    let child = node.children.find((c) => c.data.san === san)
    if (!child) {
      child = new Node({
        fen: makeFen(this.chess.toSetup()),
        lan: lan,
        san: san,
        parent: node
      })
      node.children.push(child)
    }
    gameState.currentNode = child
  }

  /** Navigates one move forward. Returns whether a move was made. */
  forward() {
    const n = this.currentNode
    if (n.children.length > 0) {
      this.currentNode = n.children[0]
      return true
    }
    return false
  }

  /** Navigates one move back. Returns whether a move was made. */
  back() {
    const n = this.currentNode
    if (n.data.parent) {
      this.currentNode = n.data.parent
      return true
    }
    return false
  }
}

export const gameState = new GameState()
