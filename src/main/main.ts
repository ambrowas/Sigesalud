import path from 'path'
import { app, BrowserWindow } from 'electron'
import { initializeDbIfNeeded } from './services/db.service'
import './ipc'

let mainWindow: BrowserWindow | null = null

async function createWindow() {
  const isDev = process.env.NODE_ENV === 'development'
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  if (isDev) {
    await mainWindow.loadURL('http://localhost:5175')
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  await initializeDbIfNeeded()
  await createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
