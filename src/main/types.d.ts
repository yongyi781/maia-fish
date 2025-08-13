import type { pgn } from "chessops"
import type { ElectronAPI } from "@electron-toolkit/preload"
import type { AppConfig } from "../../main/config"
import type { InferenceSession } from "onnxruntime-node"

export interface WindowAPI {
  config: {
    get(): Promise<AppConfig>
    set(config: AppConfig): Promise<void>
  }
  engine: {
    choose(): Promise<string>
    start(path: string): Promise<boolean>
    send(command: string): void
    getOptions(): Promise<any[]>
  }
  writeToClipboard(text: string): void
  analyzeMaia({
    boardInput: string,
    eloSelfCategory: number,
    eloOppoCategory: number
  }): Promise<InferenceSession.OnnxValueMapType>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: WindowAPI
  }
}
