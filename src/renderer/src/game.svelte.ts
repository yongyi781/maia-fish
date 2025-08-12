import { Chess, fen, makeUci, type NormalMove, parseUci, pgn } from "chessops"
import { makeFen } from "chessops/fen"
import { makeSan, makeSanAndPlay, parseSan } from "chessops/san"
import { Score } from "./types"
import { allLegalMoves, chessFromFen, normalizeMove } from "./utils"
import { config } from "./config.svelte"

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
}

export function humanProbability(a: MoveAnalysis) {
  return a.lichessProbability !== undefined ? a.lichessProbability : a.maiaProbability
}

/**
 * Node data associated with a move as well as the resulting position. When parsing make sure you transform into class
 * instances.
 */
export class NodeData implements pgn.PgnNodeData {
  /** The move number in plies (half-moves). */
  moveNumber: number
  /** Short algebraic notation for the move. */
  san: string
  /** Long algebraic notation for the move. */
  lan: string
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
  eval: Score = $derived(
    this.moveAnalyses.length === 0
      ? undefined
      : this.moveAnalyses.reduce((max, ma) =>
          ma !== undefined && rawEval(ma[1].score) > rawEval(max[1].score) ? ma : max
        )[1]?.score
  )

  /** Current position's human evaluation, in centipawns. */
  humanEval: Score = $derived(
    this.moveAnalyses.length === 0
      ? undefined
      : {
          type: "cp",
          value: this.moveAnalyses.reduce(
            (acc, [, ma]) => acc + rawEvalClamped(ma.score) * (humanProbability(ma) ?? 0),
            0
          )
        }
  )

  /** Gets the top human move according to the analysis. */
  topHumanMoveUci: string = $derived.by(() => {
    const entries = this.moveAnalyses.filter((a) => humanProbability(a[1]) !== undefined)
    if (entries.length > 0)
      return entries.reduce((a, b) => (humanProbability(a[1]) > humanProbability(b[1]) ? a : b))[0]
  })

  /** Gets the top engine move (multiple if tied) according to the analysis. */
  topEngineMovesUci: string[] = $derived.by(() => {
    const entries = this.moveAnalyses.filter((a) => a[1].score !== undefined)
    if (entries.length === 0) return []
    let res = []
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

  /** Returns the path from the root to this node. */
  pathToRoot(): Node[] {
    let node: Node = this
    let res = []
    while (node) {
      res.push(node)
      node = node.data.parent
    }
    return res
  }

  /** Returns whether this node is the root. */
  isRoot() {
    return this.data.parent === undefined
  }

  /** Returns the moves from the root to this node. */
  movesFromRootUci(): string[] {
    const path = this.pathToRoot()
    path.reverse()
    path.shift()
    return path.map((n) => n.data.lan)
  }

  end(): Node {
    let node: Node = this
    while (node.children.length) node = node.children[0]
    return node
  }

  async fetchLichessStats() {
    const data = this.data
    if (
      !config.value?.lichessBookSpeeds ||
      !config.value?.lichessBookRatings ||
      data.moveNumber > 20 ||
      data.moveAnalyses.length === 0 ||
      data.moveAnalyses[0][1].lichessProbability !== undefined
    )
      return
    const url = makeLichessUrl(data.fen)
    const response = await fetch(url)
    if (!response.ok) {
      console.warn("Failed to fetch lichess stats", response)
      return
    }
    const json = await response.json()
    const totalGames = json.moves.reduce((a: number, b: any) => a + b.white + b.draws + b.black, 0)
    if (totalGames < config.value.lichessThreshold) return
    const pos = chessFromFen(data.fen)
    for (const [lan, a] of data.moveAnalyses) {
      const move = json.moves.find((m: any) => makeUci(normalizeMove(pos, parseUci(m.uci) as NormalMove)) === lan)
      if (!move) a.lichessProbability = 0
      else a.lichessProbability = (move.white + move.draws + move.black) / totalGames
    }
  }
}

/** Converts a `pgn.Node` to a `Node`. */
export function fromPgnNode(pgnNode: pgn.Node<pgn.PgnNodeData>, initialFen: string) {
  const res = new Node({ fen: initialFen })
  const stack = [
    {
      before: pgnNode,
      after: res
    }
  ]
  while (stack.length > 0) {
    const { before, after } = stack.pop()
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
    headers: new Map([
      ["Event", "World Chess Championship"],
      ["White", "Stockfish"],
      ["Black", "Magnus Carlsen"]
    ]),
    moves: new Node()
  })
  /** The chess position. */
  chess = $state(Chess.default())
  /** The currently selected node. */
  currentNode = $state(new Node({}))
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

  /** Performs a move. */
  makeMove(m: NormalMove) {
    const node = gameState.currentNode
    const san = makeSanAndPlay(this.chess, m)
    if (!san) {
      throw new Error("Invalid SAN in makeMove")
    }
    const lan = makeUci(m)
    let exists = false
    for (let c of node.children)
      if (c.data.san === san) {
        gameState.currentNode = c
        exists = true
        break
      }
    if (!exists) {
      const child = new Node({
        fen: makeFen(this.chess.toSetup()),
        lan: lan,
        san: san,
        parent: node
      })
      node.children.push(child)
      gameState.currentNode = child
    }
  }

  /** Navigates one move forward. */
  forward() {
    if (this.currentNode.children.length > 0) this.currentNode = this.currentNode.children[0]
  }

  /** Navigates one move back. */
  back() {
    if (!this.currentNode.isRoot()) this.currentNode = this.currentNode.data.parent
  }
}

export const gameState = new GameState()

function makeLichessUrl(fen: string) {
  const url = new URL("https://explorer.lichess.ovh/lichess")
  const params = new URLSearchParams()
  params.append("variant", "standard")
  params.append("topGames", "0")
  params.append("recentGames", "0")
  params.append("speeds", config.value.lichessBookSpeeds.toString())
  params.append("ratings", config.value.lichessBookRatings.toString())
  params.append("fen", fen)
  url.search = params.toString()
  return url
}
