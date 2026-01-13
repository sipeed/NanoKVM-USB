import { app, BrowserWindow, ipcMain, shell, systemPreferences } from 'electron'
import type { IpcMainEvent, OpenExternalOptions } from 'electron'

import { IpcEvents } from '../../common/ipc-events'

export function registerApp(): void {
  ipcMain.handle(IpcEvents.GET_APP_VERSION, getAppVersion)
  ipcMain.handle(IpcEvents.GET_PLATFORM, getPlatform)
  ipcMain.on(IpcEvents.OPEN_EXTERNAL_RUL, openExternalUrl)
  ipcMain.handle(IpcEvents.REQUEST_MEDIA_PERMISSIONS, requestMediaPermissions)
  ipcMain.on(IpcEvents.SET_FULL_SCREEN, setFullScreen)
}

function getAppVersion(): string {
  return app.getVersion()
}

function getPlatform(): string {
  return process.platform
}

function openExternalUrl(_: IpcMainEvent, url: string, options?: OpenExternalOptions): void {
  shell.openExternal(url, options).catch(console.error)
}

async function requestMediaPermissions(): Promise<{
  camera: boolean
  microphone: boolean
}> {
  const camera = await grant('camera')
  const microphone = await grant('microphone')

  return { camera, microphone }
}

async function grant(media: 'camera' | 'microphone'): Promise<boolean> {
  try {
    const status = systemPreferences.getMediaAccessStatus(media)
    if (status === 'granted') {
      return true
    }

    return await systemPreferences.askForMediaAccess(media)
  } catch (error) {
    console.error('Error request permission:', error)
    return false
  }
}

function setFullScreen(e: IpcMainEvent, flag: boolean): void {
  const win = BrowserWindow.fromWebContents(e.sender)
  if (!win) return

  win.setFullScreen(flag)
}
