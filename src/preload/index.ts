import { clipboard, contextBridge, ipcRenderer } from "electron"
import { electronAPI } from "@electron-toolkit/preload"
import type { WindowAPI } from "../main/types"
import type { AppConfig } from "../main/config"

// Custom APIs for renderer
const api: WindowAPI = {
  config: {
    get: () => ipcRenderer.invoke("config:get"),
    set: (config: AppConfig) => ipcRenderer.invoke("config:set", config)
  },
  engine: {
    choose: () => ipcRenderer.invoke("engine:choose"),
    start: (path: string) => ipcRenderer.invoke("engine:start", path),
    send: (command: string) => ipcRenderer.send("engine:send", command),
    getOptions: function (): Promise<any[]> {
      throw new Error("Function not implemented.")
    }
  },
  writeToClipboard: (text: string) => clipboard.writeText(text),
  analyzeMaia: ({ boardInput, eloSelfCategory, eloOppoCategory }) =>
    ipcRenderer.invoke("analyze-maia", {
      boardInput,
      eloSelfCategory,
      eloOppoCategory
    })
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
