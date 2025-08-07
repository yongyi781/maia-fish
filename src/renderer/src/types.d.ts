import { pgn } from "chessops"
import { ElectronAPI } from "@electron-toolkit/preload"

declare global {
  interface Window {
    electron: ElectronAPI
    api: any
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
