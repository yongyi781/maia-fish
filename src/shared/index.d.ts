import { ElectronAPI } from "@electron-toolkit/preload"
import { WindowAPI } from "../preload"

export interface MaiaInput {
  boardInput: Float32Array
  eloSelfCategory: number
  eloOppoCategory: number
}

export interface MaiaOutput {
  logits: Float32Array
  value: Float32Array
}

/** Evaluation score. */
export type Score = {
  type: "cp" | "mate"
  value: number
  bound?: "lower" | "upper"
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: WindowAPI
  }
}
