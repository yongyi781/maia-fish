import { pgn } from "chessops"
import { ElectronAPI } from "@electron-toolkit/preload"
import { AppConfig } from "../../main/config"
import { InferenceSession } from "onnxruntime-node"

export interface WindowAPI {
  config: {
    get(): Promise<AppConfig>
    set(config: AppConfig): Promise<void>
  }
  engine: {
    choose(): Promise<string>
    start(path: string): void
    send(command: string): void
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
