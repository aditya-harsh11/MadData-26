const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { spawn } = require("child_process");

let mainWindow;
let pythonProcess;

function spawnBackend() {
  const backendDir = path.join(__dirname, "..", "backend");

  // Prefer native ARM64 Python for Qualcomm NPU acceleration
  const arm64Python = path.join(
    process.env.LOCALAPPDATA || "",
    "Programs",
    "Python",
    "Python313-arm64",
    "python.exe"
  );
  const fs = require("fs");
  const pythonCmd =
    process.platform === "win32" && fs.existsSync(arm64Python)
      ? arm64Python
      : process.platform === "win32"
      ? "python"
      : "python3";

  pythonProcess = spawn(pythonCmd, ["main.py"], {
    cwd: backendDir,
    stdio: ["pipe", "pipe", "pipe"],
  });

  pythonProcess.stdout.on("data", (data) => {
    console.log(`[Backend] ${data.toString().trim()}`);
  });

  pythonProcess.stderr.on("data", (data) => {
    console.error(`[Backend] ${data.toString().trim()}`);
  });

  pythonProcess.on("close", (code) => {
    console.log(`[Backend] Process exited with code ${code}`);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1200,
    minHeight: 800,
    backgroundColor: "#0a0a0f",
    titleBarStyle: "hiddenInset",
    frame: process.platform === "darwin" ? false : true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const isDev = !app.isPackaged;

  if (isDev) {
    mainWindow.loadURL("http://localhost:3000");
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "out", "index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  spawnBackend();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (pythonProcess) {
    pythonProcess.kill();
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (pythonProcess) {
    pythonProcess.kill();
  }
});

ipcMain.handle("get-backend-url", () => {
  return "http://localhost:8000";
});

ipcMain.handle("get-ws-url", () => {
  return "ws://localhost:8000/ws";
});
