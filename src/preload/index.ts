import { clipboard, contextBridge, ipcRenderer } from "electron"
import { electronAPI } from "@electron-toolkit/preload"
import type { AppConfig } from "../shared/config"
import type { MaiaInput, MaiaOutput } from "../shared"

// Custom APIs for renderer
const api = {
  config: {
    get: () => ipcRenderer.invoke("config:get") as Promise<AppConfig>,
    set: (config: AppConfig) => ipcRenderer.invoke("config:set", config)
  },
  engine: {
    choose: () => ipcRenderer.invoke("engine:choose") as Promise<string>,
    start: (path: string) => ipcRenderer.invoke("engine:start", path) as Promise<boolean>,
    send: (command: string) => ipcRenderer.send("engine:send", command),
    getOptions: function (): Promise<string[]> {
      throw new Error("Function not implemented.")
    }
  },
  writeToClipboard: (text: string) => clipboard.writeText(text),
  analyzeMaia: (input: MaiaInput) => ipcRenderer.invoke("analyze-maia", input) as Promise<MaiaOutput>
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
