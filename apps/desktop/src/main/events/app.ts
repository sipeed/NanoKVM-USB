import { app, ipcMain, shell, systemPreferences } from 'electron'
import type { IpcMainEvent, IpcMainInvokeEvent } from 'electron'

import type { MediaKind } from '@nanokvm/core'

import { IpcEvents } from '../../common/ipc-events'

export function registerApp(): void {
  ipcMain.handle(IpcEvents.GET_APP_VERSION, getAppVersion)
  ipcMain.handle(IpcEvents.GET_PLATFORM, getPlatform)
  ipcMain.on(IpcEvents.OPEN_EXTERNAL_URL, openExternalUrl)
  ipcMain.handle(IpcEvents.CHECK_MEDIA_PERMISSION, checkMediaPermission)
  ipcMain.handle(IpcEvents.REQUEST_MEDIA_PERMISSION, requestMediaPermission)
}

function getAppVersion(): string {
  return app.getVersion()
}

function getPlatform(): string {
  return process.platform
}

function openExternalUrl(_: IpcMainEvent, url: string): void {
  shell.openExternal(url).catch(console.error)
}

function checkMediaPermission(_: IpcMainInvokeEvent, kind: MediaKind): boolean {
  try {
    return systemPreferences.getMediaAccessStatus(kind) === 'granted'
  } catch (error) {
    console.error('Error checking media permission:', error)
    return false
  }
}

async function requestMediaPermission(_: IpcMainInvokeEvent, kind: MediaKind): Promise<boolean> {
  try {
    const status = systemPreferences.getMediaAccessStatus(kind)
    if (status === 'granted') {
      return true
    }

    return await systemPreferences.askForMediaAccess(kind)
  } catch (error) {
    console.error('Error request permission:', error)
    return false
  }
}
