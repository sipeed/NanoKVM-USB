import { join } from 'path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { app, BrowserWindow, session, shell } from 'electron'
import log from 'electron-log/main'

import icon from '../../resources/icon.png?asset'
import * as events from './events'

console.error = log.error

let mainWindow: BrowserWindow

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
    if(!is.dev) mainWindow.removeMenu()
    mainWindow.maximize()
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

  // app.on('browser-window-created', (_, window) => {
  //   //optimizer.watchWindowShortcuts(window
  //   window.show()
  // })

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
