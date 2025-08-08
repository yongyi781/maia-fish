import { Chess, fen, makeUci, pgn } from "chessops"
import { parseFen } from "chessops/fen"
import { makeSan } from "chessops/san"
import { legalMoves } from "./utils"
import { Score } from "./types"

/** Converts an `Score` to a raw evaluation, for comparison purposes. */
export function rawEval(e: Score | undefined) {
  if (!e) return -Infinity
  switch (e.type) {
    case "cp":
      return e.value
    case "mate":
      return e.value === 0 ? -360 : Math.sign(e.value) * (360 - Math.abs(e.value))
    case "tablebase":
      return e.value === 0 ? -150 : Math.sign(e.value) * (150 - Math.abs(e.value))
  }
}

/** Analysis associated with each legal move. */
export class MoveAnalysis {
  pv: string[] = $state([])
  depth?: number = $state()
  score?: Score = $state()
  humanProbability?: number = $state()
  /** Number of nodes searched in this analysis. */
  nodes?: number = $state()

  constructor(data: Partial<MoveAnalysis>) {
    Object.assign(this, data)
  }
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
  /** Legal move analyses: eval, depth, Maia policy, ... */
  moveAnalyses: Record<string, MoveAnalysis> = $state({})
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
    const pos = Chess.fromSetup(parseFen(this.fen).unwrap()).unwrap()
    const pairs = legalMoves(pos).map((move) => {
      return [makeUci(move), new MoveAnalysis({ pv: [makeSan(pos, move)] })]
    })
    this.moveAnalyses = Object.fromEntries(pairs)
  }

  /** Returns the side to move. */
  side() {
    return this.fen.split(" ")[1]
  }
}

/** Reactive version of `pgn.Node`. */
export class Node {
  children: Node[] = $state([])
  data: NodeData = $state()

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
    return path.map((n) => n.data.lan).join(" ")
  }

  end(): Node {
    let node: Node = this
    while (node.children.length) node = node.children[0]
    return node
  }
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
}

export const gameState = new GameState()
