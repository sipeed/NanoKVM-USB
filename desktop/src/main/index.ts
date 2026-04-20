import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { app, BrowserWindow, session, shell } from 'electron'
import log from 'electron-log/main'

import icon from '../../resources/icon.png?asset'
import * as events from './events'
import { device } from './device'

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
    mainWindow.maximize()
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Prevent macOS from handling mouse side buttons as browser navigation
  mainWindow.webContents.on('will-navigate', (event) => {
    event.preventDefault()
  })

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.clearHistory()
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

type SideButton = 'side' | 'extra'

type FieldMatcher = { field: number; equals: number | number[] }

type SideButtonRule = {
  name?: string
  eventType: number
  fields?: FieldMatcher[]
  emit: SideButton
}

type MouseHookEvent =
  | { kind: 'status'; status: 'ok' | 'failed' }
  | { kind: 'button'; button: SideButton }

type MouseHook = {
  startHook: (rules: SideButtonRule[], cb: (event: MouseHookEvent) => void) => void
  stopHook: () => void
}

// HID button bits, matching the names Linux uses in input event codes.
const HID_BIT: Record<SideButton, number> = {
  side: 0x08,  // BTN_SIDE
  extra: 0x10  // BTN_EXTRA
}

function resourcePath(...segments: string[]): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'app.asar.unpacked', 'resources', ...segments)
    : join(__dirname, '../../resources', ...segments)
}

function loadMouseHook(): MouseHook | null {
  if (process.platform !== 'darwin') return null

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require(resourcePath('native', 'mouse_hook.node'))
  } catch (err) {
    console.error('Failed to load mouse hook native addon:', err)
    return null
  }
}

function loadSideButtonRules(): SideButtonRule[] | null {
  // User override takes precedence; file location is logged so users can find it.
  const userPath = join(app.getPath('userData'), 'side-button-rules.json')
  if (existsSync(userPath)) {
    try {
      const parsed = JSON.parse(readFileSync(userPath, 'utf8'))
      if (Array.isArray(parsed) && parsed.length > 0) {
        log.info(`[mouse-hook] loaded ${parsed.length} rule(s) from ${userPath}`)
        return parsed
      }
      console.error(`[mouse-hook] ${userPath} must be a non-empty array; falling back to defaults`)
    } catch (err) {
      console.error(`[mouse-hook] failed to parse ${userPath}; falling back to defaults:`, err)
    }
  }

  const defaultPath = resourcePath('side-button-rules.default.json')
  try {
    const parsed = JSON.parse(readFileSync(defaultPath, 'utf8'))
    if (!Array.isArray(parsed) || parsed.length === 0) {
      console.error(`[mouse-hook] default rules file ${defaultPath} is empty or invalid`)
      return null
    }
    return parsed
  } catch (err) {
    console.error(`[mouse-hook] failed to load default rules from ${defaultPath}:`, err)
    return null
  }
}

function setupSideButtonForwarding(): void {
  const mouseHook = loadMouseHook()
  if (!mouseHook) return

  const rules = loadSideButtonRules()
  if (!rules) return

  try {
    mouseHook.startHook(rules, (event) => {
      if (event.kind === 'status') {
        if (event.status !== 'ok') console.error(`[mouse-hook] tap status: ${event.status}`)
        return
      }

      if (event.kind !== 'button' || !mainWindow?.isFocused()) return

      // Side buttons are only declared on the absolute HID interface (0x02).
      // Use last known absolute position so we don't teleport the cursor.
      const hidBit = HID_BIT[event.button]
      const { x, y } = device.getLastAbsPosition()
      const x1 = x & 0xff
      const x2 = (x >> 8) & 0xff
      const y1 = y & 0xff
      const y2 = (y >> 8) & 0xff
      device.sendMouseData([0x02, hidBit, x1, x2, y1, y2, 0])
        .then(() => device.sendMouseData([0x02, 0, x1, x2, y1, y2, 0]))
        .catch((err) => console.error('Failed to send side button:', err))
    })
  } catch (err) {
    console.error('[mouse-hook] startHook rejected rules:', err)
    return
  }

  app.on('will-quit', () => mouseHook.stopHook())
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
  setupSideButtonForwarding()

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
