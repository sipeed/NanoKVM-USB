import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'

import type { UpdaterInfo } from '@nanokvm/core'

import type { DesktopApi } from '../common/ipc-api'
import { IpcEvents } from '../common/ipc-events'

function subscribe(channel: IpcEvents, listener: (...args: unknown[]) => void): () => void {
  const wrapped = (_event: IpcRendererEvent, ...args: unknown[]): void => {
    listener(...args)
  }

  ipcRenderer.on(channel, wrapped)

  return (): void => {
    ipcRenderer.removeListener(channel, wrapped)
  }
}

// 暴露给渲染层的类型化契约，渲染层通过 window.api 访问
const api: DesktopApi = {
  getAppVersion: () => ipcRenderer.invoke(IpcEvents.GET_APP_VERSION),
  getPlatform: () => ipcRenderer.invoke(IpcEvents.GET_PLATFORM),
  openExternal: (url) => {
    ipcRenderer.send(IpcEvents.OPEN_EXTERNAL_URL, url)
  },
  checkMediaPermission: (kind) => ipcRenderer.invoke(IpcEvents.CHECK_MEDIA_PERMISSION, kind),
  requestMediaPermission: (kind) => ipcRenderer.invoke(IpcEvents.REQUEST_MEDIA_PERMISSION, kind),
  serial: {
    list: () => ipcRenderer.invoke(IpcEvents.SERIAL_LIST),
    open: (options) => ipcRenderer.invoke(IpcEvents.SERIAL_OPEN, options),
    close: () => ipcRenderer.invoke(IpcEvents.SERIAL_CLOSE),
    read: (minSize, timeoutMs) => ipcRenderer.invoke(IpcEvents.SERIAL_READ, minSize, timeoutMs),
    write: (data) => ipcRenderer.invoke(IpcEvents.SERIAL_WRITE, data),
    onDisconnected: (callback) => subscribe(IpcEvents.SERIAL_DISCONNECTED, () => callback())
  },
  updater: {
    check: () => ipcRenderer.invoke(IpcEvents.CHECK_FOR_UPDATES),
    download: () => {
      ipcRenderer.send(IpcEvents.DOWNLOAD_UPDATE)
    },
    onUpdateAvailable: (callback) =>
      subscribe(IpcEvents.UPDATE_AVAILABLE, (info) => callback(info as UpdaterInfo)),
    onUpdateNotAvailable: (callback) => subscribe(IpcEvents.UPDATE_NOT_AVAILABLE, () => callback()),
    onProgress: (callback) =>
      subscribe(IpcEvents.DOWNLOAD_PROGRESS, (percent) => callback(percent as number)),
    onDownloaded: (callback) => subscribe(IpcEvents.UPDATE_DOWNLOADED, () => callback()),
    onError: (callback) => subscribe(IpcEvents.UPDATE_ERROR, () => callback())
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  window.api = api
}
