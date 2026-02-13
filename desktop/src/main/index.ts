import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { app, BrowserWindow, session, shell } from 'electron'
import log from 'electron-log/main'

import icon from '../../resources/icon.png?asset'
import * as events from './events'

console.error = log.error

let mainWindow: BrowserWindow

interface WindowState {
  width: number
  height: number
  x?: number
  y?: number
  isMaximized: boolean
}

function getWindowStatePath(): string {
  return join(app.getPath('userData'), 'window-state.json')
}

function loadWindowState(): WindowState {
  const defaultState: WindowState = {
    width: 1200,
    height: 800,
    isMaximized: false
  }

  try {
    const statePath = getWindowStatePath()
    if (existsSync(statePath)) {
      const data = readFileSync(statePath, 'utf8')
      return { ...defaultState, ...JSON.parse(data) }
    }
  } catch (err) {
    log.error('Failed to load window state:', err)
  }

  return defaultState
}

function saveWindowState(): void {
  try {
    if (!mainWindow) return

    const bounds = mainWindow.getBounds()
    const state: WindowState = {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      isMaximized: mainWindow.isMaximized()
    }

    writeFileSync(getWindowStatePath(), JSON.stringify(state, null, 2))
  } catch (err) {
    log.error('Failed to save window state:', err)
  }
}

function createWindow(): void {
  const windowState = loadWindowState()

  mainWindow = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    x: windowState.x,
    y: windowState.y,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      zoomFactor: 1.0
    }
  })

  mainWindow.on('ready-to-show', () => {
    if (windowState.isMaximized) {
      mainWindow.maximize()
    }
    mainWindow.show()
    mainWindow.webContents.setZoomFactor(1.0)
  })

  // Save window state on resize and move
  mainWindow.on('resize', () => {
    if (!mainWindow.isMaximized()) {
      saveWindowState()
    }
  })

  mainWindow.on('move', () => {
    if (!mainWindow.isMaximized()) {
      saveWindowState()
    }
  })

  mainWindow.on('maximize', saveWindowState)
  mainWindow.on('unmaximize', saveWindowState)
  mainWindow.on('close', saveWindowState)

  // Open DevTools with keyboard shortcut (Cmd+Option+I on Mac, Ctrl+Shift+I on others)
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown') {
      // Mac: Cmd+Option+I
      if (process.platform === 'darwin' && input.meta && input.alt && input.key.toLowerCase() === 'i') {
        mainWindow.webContents.toggleDevTools()
        event.preventDefault()
      }
      // Windows/Linux: Ctrl+Shift+I
      else if (process.platform !== 'darwin' && input.control && input.shift && input.key.toLowerCase() === 'i') {
        mainWindow.webContents.toggleDevTools()
        event.preventDefault()
      }
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.sipeed.usbkvm')

  session.defaultSession.setPermissionRequestHandler((_, permission, callback) => {
    const allowedPermissions = ['media', 'clipboard-read', 'pointerLock']
    callback(allowedPermissions.includes(permission))
  })

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  events.registerApp()
  events.registerSerialPort()

  createWindow()

  events.registerUpdater(mainWindow)

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
