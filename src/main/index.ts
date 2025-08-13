import { electronApp, is } from "@electron-toolkit/utils"
import { type ChildProcessWithoutNullStreams, spawn } from "child_process"
import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, shell } from "electron"
import { InferenceSession, Tensor } from "onnxruntime-node"
import path, { join } from "path"
import icon from "../../resources/icon.ico?asset"
import { loadConfig, saveConfig } from "./config"

/** Engine output interval, in milliseconds. */
let mainWindow: BrowserWindow
let engineProcess: ChildProcessWithoutNullStreams
let maiaModel: InferenceSession
let engineOutputTimeout: NodeJS.Timeout | undefined

function getModelPath() {
  if (app.isPackaged) {
    // In packaged app: process.resourcesPath is correct
    return path.join(process.resourcesPath, "maia_rapid.onnx")
  } else {
    // In dev: load from source directory
    return path.join(__dirname, "..", "..", "resources", "maia_rapid.onnx")
  }
}

function createWindow(): void {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    backgroundColor: "black",
    width: 1024,
    height: 900,
    icon,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false
    }
  })

  mainWindow.on("ready-to-show", () => {
    mainWindow.show()
  })

  mainWindow.on("closed", () => {
    clearInterval(engineOutputTimeout)
    engineProcess?.kill()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: "deny" }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"])
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  // Set app user model id for windows
  electronApp.setAppUserModelId("com.electron")

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  // app.on("browser-window-created", (_, window) => {
  //   optimizer.watchWindowShortcuts(window)
  // })

  // IPC
  ipcMain.handle("config:get", () => loadConfig())

  ipcMain.handle("config:set", (_, newConfig) => {
    saveConfig(newConfig)
  })

  ipcMain.handle("engine:start", (_, path: string) => {
    if (engineProcess) engineProcess.kill()
    if (engineOutputTimeout) {
      clearInterval(engineOutputTimeout)
      engineOutputTimeout = undefined
    }
    try {
      engineProcess = spawn(path)
      let chunks: string[] = []
      const config = loadConfig()
      engineOutputTimeout = setInterval(() => {
        if (chunks.length > 0) {
          mainWindow.webContents.send("engine-output", chunks)
          chunks = []
        }
      }, config.analysisUpdateInterval)

      engineProcess.stdout.on("data", (data: Buffer) => {
        chunks.push(...data.toString().split("\n"))
      })

      return new Promise((resolve) => {
        const onData = (data: Buffer) => {
          if (data.toString().includes("readyok")) {
            engineProcess.stdout.removeListener("data", onData)
            resolve(true)
          }
          for (const line of data.toString().split("\n")) {
            console.log("Received line:", line)
            if (line.startsWith("id name")) {
              mainWindow.webContents.send("engine-id", line.substring(8).trim())
              break
            }
          }
        }
        engineProcess.stdout.on("data", onData)
        engineProcess.stdin.write("uci\nisready\n")
      })
    } catch (error) {
      console.log(error)
      return false
    }
  })

  ipcMain.handle("engine:choose", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters:
        process.platform === "win32"
          ? [
              { name: "Executable file", extensions: ["exe"] },
              { name: "All files", extensions: ["*"] }
            ]
          : []
    })
    return result.filePaths[0]
  })

  ipcMain.on("engine:send", (_, command) => {
    console.log("SF command:", command)
    if (engineProcess && engineProcess.stdin.writable) engineProcess.stdin.write(command + "\n")
  })

  // ipcMain.handle("engine:getOptions", async () => {
  //   if (!engineProcess) return []
  //   return new Promise((resolve) => {
  //     const options: { name: string; type: string; default: string }[] = []
  //     const listener = (data: Buffer) => {
  //       const lines = data.toString().split("\n")
  //       for (const line of lines) {
  //         if (line.startsWith("option")) {
  //           const match = line.match(/option name (.*) type (.*) default (.*)/)
  //           if (match) {
  //             options.push({ name: match[1], type: match[2], default: match[3] })
  //           }
  //         } else if (line.startsWith("uciok")) {
  //           engineProcess.stdout.removeListener("data", listener)
  //           resolve(options)
  //         }
  //       }
  //     }
  //     engineProcess.stdout.on("data", listener)
  //     engineProcess.stdin.write("uci\n")
  //   })
  // })

  ipcMain.handle("analyze-maia", (_, { boardInput, eloSelfCategory, eloOppoCategory }) => {
    if (!maiaModel) return
    const feeds: Record<string, Tensor> = {
      boards: new Tensor("float32", boardInput, [1, 18, 8, 8]),
      elo_self: new Tensor("int64", [eloSelfCategory]),
      elo_oppo: new Tensor("int64", [eloOppoCategory])
    }
    return maiaModel.run(feeds)
  })

  createWindow()

  app.on("activate", function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  const config = loadConfig()
  console.log("Config: ", config)

  const menu = Menu.buildFromTemplate([
    {
      label: "File",
      submenu: [
        {
          label: "New Game",
          accelerator: "Ctrl+N",
          click() {
            mainWindow.webContents.send("newGame")
          }
        },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { type: "separator" },
        {
          label: "Paste FEN or PGN",
          accelerator: "Ctrl+Shift+V",
          click() {
            mainWindow.webContents.send("paste", clipboard.readText())
          }
        }
      ]
    },
    {
      label: "Tree",
      submenu: [
        {
          label: "Root",
          accelerator: "Home",
          click() {
            mainWindow.webContents.send("gotoRoot")
          }
        },
        {
          label: "End",
          accelerator: "End",
          click() {
            mainWindow.webContents.send("gotoEnd")
          }
        },
        {
          label: "Previous variation",
          accelerator: "Up",
          click() {
            mainWindow.webContents.send("prevVariation")
          }
        },
        {
          label: "Next variation",
          accelerator: "Down",
          click() {
            mainWindow.webContents.send("nextVariation")
          }
        },
        { type: "separator" },
        {
          label: "Return to mainline",
          accelerator: "M",
          click() {
            mainWindow.webContents.send("returnToMainline")
          }
        },
        {
          label: "Promote to mainline",
          accelerator: "CommandOrControl+Up",
          click() {
            mainWindow.webContents.send("promoteToMainline")
          }
        },
        { type: "separator" },
        {
          label: "Delete node",
          accelerator: "Backspace",
          click() {
            mainWindow.webContents.send("deleteNode")
          }
        },
        {
          label: "Delete other lines",
          accelerator: "X",
          click() {
            mainWindow.webContents.send("deleteOtherLines")
          }
        }
      ]
    },
    {
      label: "View",
      submenu: [
        {
          label: "Flip board",
          accelerator: "F",
          click() {
            mainWindow.webContents.send("flipBoard")
          }
        }
      ]
    },
    {
      label: "Analysis",
      submenu: [
        {
          label: "Forget analysis",
          accelerator: "Ctrl+.",
          click() {
            mainWindow.webContents.send("forgetAnalysis")
          }
        }
      ]
    },
    {
      label: "Play",
      submenu: [
        {
          label: "Top engine move",
          accelerator: "F1",
          click() {
            mainWindow.webContents.send("playTopEngineMove")
          }
        },
        {
          label: "Top human move",
          accelerator: "F2",
          click() {
            mainWindow.webContents.send("playTopHumanMove")
          }
        },
        {
          label: "Weighted human move",
          accelerator: "F3",
          click() {
            mainWindow.webContents.send("playWeightedHumanMove")
          }
        },
        {
          label: "Random move",
          accelerator: "Ctrl+/",
          click() {
            mainWindow.webContents.send("playRandomMove")
          }
        }
      ]
    },
    {
      label: "Window",
      submenu: [{ role: "reload" }, { role: "toggleDevTools" }]
    }
  ])
  Menu.setApplicationMenu(menu)
  maiaModel = await InferenceSession.create(getModelPath())
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit()
  }
})
