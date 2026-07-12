import { ipcMain, IpcMainInvokeEvent, MessageChannelMain } from 'electron'

import { IpcEvents } from '../../common/ipc-events'
import {
  CaptureDevice,
  CaptureOptions,
  CaptureSession,
  listDevices,
  resolveCapture
} from '../capture/engine'

const session = new CaptureSession()

export function registerCapture(): void {
  ipcMain.handle(IpcEvents.GET_CAPTURE_DEVICES, getCaptureDevices)
  ipcMain.handle(IpcEvents.START_CAPTURE, startCapture)
  ipcMain.handle(IpcEvents.STOP_CAPTURE, stopCapture)
}

async function getCaptureDevices(): Promise<CaptureDevice[]> {
  return listDevices()
}

async function startCapture(e: IpcMainInvokeEvent, opts: CaptureOptions): Promise<boolean> {
  session.stop()

  // Resolve to a device (by name) + an advertised mode; the helper reports the
  // ACTUAL delivered dimensions once the stream starts (the UVC stack may serve
  // the signal-native mode regardless of the request).
  const resolved = await resolveCapture(opts)

  const { port1, port2 } = new MessageChannelMain()
  port1.start()

  const actual = await session.start(port1, resolved, (msg) => {
    if (!e.sender.isDestroyed()) e.sender.send(IpcEvents.CAPTURE_ERROR, msg)
  })

  // Hand the renderer end of the channel to the page (preload forwards it on).
  // requestId lets the renderer ignore ports from superseded start requests.
  e.sender.postMessage(
    IpcEvents.CAPTURE_PORT,
    { width: actual.width, height: actual.height, requestId: opts.requestId },
    [port2]
  )
  return true
}

async function stopCapture(): Promise<boolean> {
  session.stop()
  return true
}
