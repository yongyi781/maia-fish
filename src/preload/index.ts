import { contextBridge, ipcRenderer } from "electron"
import { electronAPI } from "@electron-toolkit/preload"
import { AppConfig } from "../main/config"

// Custom APIs for renderer
const api = {
  config: {
    get: () => ipcRenderer.invoke("config:get"),
    set: (config: AppConfig) => ipcRenderer.invoke("config:set", config)
  },
  chooseStockfish: () => ipcRenderer.invoke("choose-stockfish"),
  start: (path: string) => ipcRenderer.send("start-stockfish", path),
  sendCommand: (cmd: string) => ipcRenderer.send("stockfish-command", cmd),
  analyzeMaia: ({ boardInput, eloSelfCategory, eloOppoCategory }) =>
    ipcRenderer.invoke("analyze-maia", {
      boardInput,
      eloSelfCategory,
      eloOppoCategory
    }),
  onOutput: (callback: (output: string) => void) => ipcRenderer.on("stockfish-output", (_, data) => callback(data))
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
