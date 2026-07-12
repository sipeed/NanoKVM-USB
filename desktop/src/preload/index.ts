import { electronAPI } from '@electron-toolkit/preload'
import { contextBridge, ipcRenderer } from 'electron'

import { IpcEvents } from '../common/ipc-events'

// MessagePorts cannot cross the contextBridge, so forward the capture channel's
// port directly into the page via window.postMessage (with transfer).
ipcRenderer.on(IpcEvents.CAPTURE_PORT, (e, meta) => {
  window.postMessage({ type: 'capture-port', meta }, '*', e.ports)
})

// Custom APIs for renderer
const api = {}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
