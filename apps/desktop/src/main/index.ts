import { join } from 'path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { app, BrowserWindow, session, shell } from 'electron'
import log from 'electron-log/main'

import icon from '../../resources/icon.png?asset'
import * as events from './events'

console.error = log.error

// 必须在 app ready / 任何 getPath('userData') 之前调用。
// workspace 包名是 @nanokvm/desktop，而 1.1.4 的包名是 nanokvm-usb；
// 不固定名字会让 Electron 把 userData 切到新目录，老用户设置全部丢失。
app.setName('nanokvm-usb')

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
    mainWindow.maximize()
    mainWindow.show()
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
    // fullscreen / keyboardLock 是菜单全屏按钮（含快捷键捕获）所需，
    // 缺省会被 Electron 拒绝，表现为桌面端点全屏没反应。
    const allowedPermissions = [
      'media',
      'clipboard-read',
      'pointerLock',
      'fullscreen',
      'keyboardLock'
    ]
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
