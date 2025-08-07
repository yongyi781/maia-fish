import { pgn } from "chessops"
import { Eval } from "./types"

export interface NodeData extends pgn.PgnNodeData {
  fen: string
  lan: string
  eval?: Eval
  parent?: Node
}

/** Reactive versions of pgn.Node and pgn.ChildNode. */
export class Node {
  children: ChildNode[] = $state([]);

  *mainlineNodes(): Iterable<ChildNode> {
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
  *pathToRoot(): Iterable<ChildNode> {
    let node: Node = this
    while (node instanceof ChildNode) {
      yield node
      node = node.data.parent
    }
  }

  /** Returns the moves from the root to this node */
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

export class ChildNode extends Node {
  data: NodeData = $state()

  constructor(data: NodeData) {
    super()
    this.data = data
  }
}

export class GameState {
  currentNode = $state(new Node())
  currentLine = $derived([...this.currentNode.end().pathToRoot()])
}

export const gameState = new GameState()
