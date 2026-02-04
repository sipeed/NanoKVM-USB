import { app, BrowserWindow, ipcMain, IpcMainInvokeEvent, shell, systemPreferences } from 'electron'
import type { IpcMainEvent, OpenExternalOptions } from 'electron'

import { IpcEvents } from '../../common/ipc-events'

export function registerApp(): void {
  ipcMain.handle(IpcEvents.GET_APP_VERSION, getAppVersion)
  ipcMain.handle(IpcEvents.GET_PLATFORM, getPlatform)
  ipcMain.on(IpcEvents.OPEN_EXTERNAL_RUL, openExternalUrl)
  ipcMain.handle(IpcEvents.CHECK_MEDIA_PERMISSION, checkMediaPermission)
  ipcMain.handle(IpcEvents.REQUEST_MEDIA_PERMISSION, requestMediaPermission)
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

function checkMediaPermission(_: IpcMainInvokeEvent, media: 'camera' | 'microphone'): boolean {
  const status = systemPreferences.getMediaAccessStatus(media)
  return status === 'granted'
}

async function requestMediaPermission(
  _: IpcMainInvokeEvent,
  media: 'camera' | 'microphone'
): Promise<boolean> {
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
