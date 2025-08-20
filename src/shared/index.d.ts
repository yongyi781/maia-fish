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

export type EngineState = "unloaded" | "idle" | "running" | "waitingBestMoveToIdle" | "waitingBestMoveToRun"

export interface UciOption {
  name: string
  type: "string" | "spin" | "button" | "check" | "combo"
  default?: string
  min?: number
  max?: number
}

export interface UciInfo {
  name?: string
  author?: string
  options: UciOption[]
}

export interface UciMoveInfo {
  depth?: number
  seldepth?: number
  multipv?: number
  score?: Score
  upperbound?: number
  lowerbound?: number
  nodes?: number
  nps?: number
  hashfull?: number
  tbhits?: number
  time?: number // milliseconds
  pv?: string[] // principal variation moves
  currmove?: string
  currmovenumber?: number
  [key: string]: unknown // for any other fields
}

export interface UciBestMove {
  bestmove: string
  ponder?: string
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: WindowAPI
  }
}
