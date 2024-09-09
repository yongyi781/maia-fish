import { pgn } from "chessops"
import { NodeData } from "./types"

export type MyNodeData = NodeData & {
  parent?: pgn.Node<MyNodeData>
}
