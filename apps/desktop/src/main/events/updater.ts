import { BrowserWindow, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'

import type { UpdaterInfo } from '@nanokvm/core'

import { IpcEvents } from '../../common/ipc-events'

autoUpdater.autoDownload = false
autoUpdater.forceDevUpdateConfig = true

export function registerUpdater(win: BrowserWindow): void {
  autoUpdater.on('update-available', (info) => {
    win.webContents.send(IpcEvents.UPDATE_AVAILABLE, info)
  })

  autoUpdater.on('update-not-available', () => {
    win.webContents.send(IpcEvents.UPDATE_NOT_AVAILABLE)
  })

  autoUpdater.on('error', (err) => {
    console.error(err)
    win.webContents.send(IpcEvents.UPDATE_ERROR)
  })

  autoUpdater.on('download-progress', (progressObj) => {
    const percent = Math.ceil(progressObj.percent)
    win.webContents.send(IpcEvents.DOWNLOAD_PROGRESS, percent)
  })

  autoUpdater.on('update-downloaded', () => {
    win.webContents.send(IpcEvents.UPDATE_DOWNLOADED)
    setImmediate(() => autoUpdater.quitAndInstall())
  })

  ipcMain.handle(IpcEvents.CHECK_FOR_UPDATES, async (): Promise<UpdaterInfo | null> => {
    try {
      const result = await autoUpdater.checkForUpdates()
      return result?.updateInfo ?? null
    } catch (e) {
      console.error(e)
      return null
    }
  })

  ipcMain.on(IpcEvents.DOWNLOAD_UPDATE, () => {
    try {
      autoUpdater.downloadUpdate()
    } catch (e) {
      console.error(e)
    }
  })
}
