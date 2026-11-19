import { ipcMain } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { SerialPort } from 'serialport'

import type { SerialPortInfo } from '@nanokvm/core'

import { IpcEvents } from '../../common/ipc-events'
import { SerialPort as SerialPortTransport } from '../device/serial-port'

type OpenSerialPortOptions = {
  path: string
  baudRate: number
}

const serialPort = new SerialPortTransport()

export function registerSerialPort(): void {
  ipcMain.handle(IpcEvents.SERIAL_LIST, listSerialPorts)
  ipcMain.handle(IpcEvents.SERIAL_OPEN, openSerialPort)
  ipcMain.handle(IpcEvents.SERIAL_CLOSE, closeSerialPort)
  ipcMain.handle(IpcEvents.SERIAL_READ, readSerialPort)
  ipcMain.handle(IpcEvents.SERIAL_WRITE, writeSerialPort)
}

async function listSerialPorts(): Promise<SerialPortInfo[]> {
  try {
    const ports = await SerialPort.list()
    const sorted = [...ports].sort((a, b) => {
      const aHasUSB = a.path.toLowerCase().includes('usb')
      const bHasUSB = b.path.toLowerCase().includes('usb')

      if (aHasUSB && !bHasUSB) return -1
      if (!aHasUSB && bHasUSB) return 1
      return a.path.localeCompare(b.path)
    })

    return sorted.map((port) => ({
      path: port.path,
      label: port.manufacturer ? `${port.path} (${port.manufacturer})` : port.path
    }))
  } catch (error) {
    console.error('Error listing serial ports:', error)
    return []
  }
}

async function openSerialPort(
  e: IpcMainInvokeEvent,
  options: OpenSerialPortOptions
): Promise<void> {
  const onDisconnect = (): void => {
    if (!e.sender.isDestroyed()) {
      e.sender.send(IpcEvents.SERIAL_DISCONNECTED)
    }
  }

  try {
    await serialPort.init({
      path: options.path,
      baudRate: options.baudRate,
      onDisconnect
    })
  } catch (error) {
    console.error('Error opening serial port:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    throw new Error(message, { cause: error })
  }
}

async function closeSerialPort(): Promise<void> {
  await serialPort.close()
}

async function readSerialPort(
  _: IpcMainInvokeEvent,
  minSize: number,
  timeoutMs?: number
): Promise<number[]> {
  return serialPort.read(minSize, timeoutMs)
}

async function writeSerialPort(_: IpcMainInvokeEvent, data: number[]): Promise<void> {
  await serialPort.write(data)
}
