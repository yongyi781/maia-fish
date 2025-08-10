import { fen, makeUci, type NormalMove, pgn } from "chessops"
import { makeFen } from "chessops/fen"
import { makeSan, parseSan } from "chessops/san"
import { Score } from "./types"
import { allLegalMoves, chessFromFen, normalizeMove } from "./utils"

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
  humanProbability?: number
  /** Number of nodes searched in this analysis. */
  nodes?: number
  nps?: number
}

/**
 * Node data associated with a move as well as the resulting position. When parsing make sure you transform into class
 * instances.
 */
export class NodeData implements pgn.PgnNodeData {
  san: string
  /** Long algebraic notation for the move. */
  lan: string
  /** The FEN string for the position. */
  fen: string
  /** Side to move. */
  turn: "w" | "b"
  /** Legal move analyses: key is LAN, value iseval, depth, Maia policy, ... */
  moveAnalyses: [string, MoveAnalysis][] = $state([])
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
    const pos = chessFromFen(this.fen)
    this.moveAnalyses = allLegalMoves(pos).map((move): [string, MoveAnalysis] => {
      return [makeUci(move), { pv: [makeSan(pos, move)] }]
    })
  }

  /** Current position's evaluation. */
  eval: Score = $derived(
    this.moveAnalyses.length === 0
      ? undefined
      : this.moveAnalyses.reduce((max, ma) => (rawEval(ma[1].score) > rawEval(max[1].score) ? ma : max))[1]?.score
  )

  /** Current position's human evaluation, in centipawns. */
  humanEval: Score = $derived(
    this.moveAnalyses.length === 0
      ? undefined
      : {
          type: "cp",
          value: this.moveAnalyses.reduce(
            (acc, [, ma]) => acc + rawEvalClamped(ma.score) * (ma.humanProbability ?? 0),
            0
          )
        }
  )

  /** Gets the top human move according to the analysis. */
  topHumanMoveUci: string = $derived.by(() => {
    const entries = this.moveAnalyses.filter((a) => a[1].humanProbability !== undefined)
    if (entries.length > 0) return entries.reduce((a, b) => (a[1].humanProbability > b[1].humanProbability ? a : b))[0]
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
}

/** Reactive version of `pgn.Node`. */
export class Node {
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
  *pathToRoot(): Iterable<Node> {
    let node: Node = this
    while (node instanceof Node) {
      yield node
      node = node.data.parent
    }
  }

  /** Returns whether this node is the root. */
  isRoot() {
    return this.data.parent === undefined
  }

  /** Returns the moves from the root to this node. */
  movesFromRoot(): string {
    const path = [...this.pathToRoot()]
    path.reverse()
    path.shift()
    return path.map((n) => n.data.lan).join(" ")
  }

  end(): Node {
    let node: Node = this
    while (node.children.length) node = node.children[0]
    return node
  }
}

/** Converts a `pgn.Node` to a `Node`. */
export function fromPgnNode(pgnNode: pgn.Node<pgn.PgnNodeData>) {
  const res = new Node()
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
  /** The currently selected node. */
  currentNode = $state(new Node({}))
  /** The line containing the currently selected node. */
  currentLine = $derived([...this.currentNode.end().pathToRoot()])
  /** Nodes in the mainline. */
  mainline = $derived([...this.root.mainlineNodes()])
  /** Whether the currently selected node is in the mainline. */
  isMainline = $derived(this.mainline.includes(this.currentNode))

  /** The root node. */
  get root() {
    return this.game.moves
  }
}

export const gameState = new GameState()
