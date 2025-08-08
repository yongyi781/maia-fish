import { electronApp, is, optimizer } from "@electron-toolkit/utils"
import { ChildProcessWithoutNullStreams, spawn } from "child_process"
import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from "electron"
import { InferenceSession, Tensor } from "onnxruntime-node"
import { join } from "path"
import icon from "../../resources/icon.png?asset"
import maia_rapid from "../../resources/maia_rapid.onnx?asset"
import { AppConfig, loadConfig, saveConfig } from "./config"

let mainWindow: BrowserWindow
let stockfishProcess: ChildProcessWithoutNullStreams
let maiaModel: InferenceSession
let config: AppConfig

function createWindow(): void {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    backgroundColor: "black",
    width: 1024,
    height: 900,
    ...(process.platform === "linux" ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false
    }
  })

  mainWindow.on("ready-to-show", () => {
    mainWindow.show()
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
  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC
  ipcMain.handle("config:get", () => config)

  ipcMain.handle("config:set", (_, newConfig) => {
    saveConfig(newConfig)
  })

  ipcMain.handle("choose-stockfish", async () => {
    const result = await dialog.showOpenDialog({ properties: ["openFile"] })
    return result.filePaths[0]
  })

  ipcMain.on("stockfish-command", (_, command) => {
    if (stockfishProcess && stockfishProcess.stdin.writable) stockfishProcess.stdin.write(command + "\n")
  })

  ipcMain.handle("analyze-maia", async (_, { boardInput, eloSelfCategory, eloOppoCategory }) => {
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

  const menu = Menu.buildFromTemplate([
    {
      label: "File",
      submenu: [{ role: "cut" }, { role: "copy" }, { role: "paste" }]
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
      label: "Play",
      submenu: [
        {
          label: "Random move",
          accelerator: "/",
          click() {
            mainWindow.webContents.send("playRandomMove")
          }
        }
      ]
    },
    {
      label: "Window",
      submenu: [{ role: "reload" }]
    }
  ])
  Menu.setApplicationMenu(menu)

  config = loadConfig()
  console.log("Config: ", config)

  if (stockfishProcess) stockfishProcess.kill()
  stockfishProcess = spawn(config.stockfishPath)
  stockfishProcess.stdout.on("data", (data: Buffer) => {
    mainWindow.webContents.send("stockfish-output", data.toString())
  })
  stockfishProcess.stdin.write(
    "uci\nisready\nucinewgame\nsetoption name Threads value 14\nsetoption name MultiPV value 256"
  )
  maiaModel = await InferenceSession.create(maia_rapid)
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit()
  }
})
