import type { ElectronAPI } from "@electron-toolkit/preload"
import type { AppConfig } from "../../main/config"

export interface WindowAPI {
  config: {
    get(): Promise<AppConfig>
    set(config: AppConfig): Promise<void>
  }
  engine: {
    choose(): Promise<string>
    start(path: string): Promise<boolean>
    send(command: string): void
    getOptions(): Promise<string[]>
  }
  writeToClipboard(text: string): void
  analyzeMaia({
    boardInput: string,
    eloSelfCategory: number,
    eloOppoCategory: number
  }): Promise<{ logits: Float32Array; value: Float32Array }>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: WindowAPI
  }
}
