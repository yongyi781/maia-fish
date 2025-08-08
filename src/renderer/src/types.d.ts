import { pgn } from "chessops"
import { ElectronAPI } from "@electron-toolkit/preload"

declare global {
  interface Window {
    electron: ElectronAPI
    api: any
  }
}

/** Evaluation score. */
export type Score = {
  type: "cp" | "mate" | "tablebase"
  value: number
  bound?: "lower" | "upper"
}
