import { electronAPI } from "@electron-toolkit/preload"
import { clipboard, contextBridge, ipcRenderer } from "electron"
import type { EngineState, MaiaInput, MaiaOutput, UciBestMove, UciInfo } from "../shared"
import type { AppConfig } from "../shared/config"

// Custom APIs for renderer
const api = {
  config: {
    get: () => ipcRenderer.invoke("config:get") as Promise<AppConfig>,
    set: (config: AppConfig) => ipcRenderer.invoke("config:set", config)
  },
  engine: {
    choose: () => ipcRenderer.invoke("engine:choose") as Promise<string>,
    getState: () => ipcRenderer.invoke("engine:getState") as Promise<EngineState>,
    start: (path: string) => ipcRenderer.invoke("engine:start", path) as Promise<UciInfo>,
    setOption: (name: string, value: number | string) =>
      ipcRenderer.invoke("engine:setOption", name, value) as Promise<void>,
    newGame: () => ipcRenderer.invoke("engine:newGame") as Promise<string>,
    position: (str: string) => ipcRenderer.invoke("engine:position", str) as Promise<void>,
    go: () => ipcRenderer.invoke("engine:go") as Promise<UciBestMove>,
    stop: () => ipcRenderer.invoke("engine:stop") as Promise<UciBestMove | undefined>
  },
  writeToClipboard: (text: string) => clipboard.writeText(text),
  analyzeMaia: (input: MaiaInput) => ipcRenderer.invoke("analyzeMaia", input) as Promise<MaiaOutput>
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("electron", electronAPI)
    contextBridge.exposeInMainWorld("api", api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}

export type WindowAPI = typeof api
