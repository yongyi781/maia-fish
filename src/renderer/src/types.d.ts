import { pgn } from "chessops"

declare global {
  interface Window {
    electron: ElectronAPI
    api: unknown
  }
}

export interface PvData {
  moves: string[]
  mate?: number
  cp?: number
}

export interface Eval {
  depth?: number
  nodes?: number
  pvs?: PvData[]
  cp?: number
  mate?: number
}

export interface NodeData extends pgn.PgnNodeData {
  fen: string
  eval?: Eval
}
