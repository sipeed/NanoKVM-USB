import { ipcMain, IpcMainInvokeEvent } from 'electron'
import { SerialPort } from 'serialport'

import { IpcEvents } from '../../common/ipc-events'
import { device } from '../device'

export function registerSerialPort(): void {
  ipcMain.handle(IpcEvents.GET_SERIAL_PORTS, getSerialPorts)
  ipcMain.handle(IpcEvents.OPEN_SERIAL_PORT, openSerialPort)
  ipcMain.handle(IpcEvents.CLOSE_SERIAL_PORT, closeSerialPort)
  ipcMain.handle(IpcEvents.SEND_KEYBOARD, sendKeyboard)
  ipcMain.handle(IpcEvents.SEND_MOUSE, sendMouse)
}

async function getSerialPorts(): Promise<string[]> {
  try {
    const ports = await SerialPort.list()
    return ports.map((port) => port.path)
  } catch (error) {
    console.error('Error listing serial ports:', error)
    return []
  }
}

async function openSerialPort(
  e: IpcMainInvokeEvent,
  path: string,
  baudRate: number = 57600
): Promise<boolean> {
  try {
    await device.serialPort.init(path, baudRate, (err) => {
      const msg = err ? err.message : ''
      e.sender.send(IpcEvents.OPEN_SERIAL_PORT_RSP, msg)
    })
    return true
  } catch (error) {
    console.error('Error opening serial port:', error)
    return false
  }
}

async function closeSerialPort(): Promise<boolean> {
  try {
    await device.serialPort.close()
    return true
  } catch (error) {
    console.error('Error closing serial port:', error)
    return false
  }
}

async function sendKeyboard(_: IpcMainInvokeEvent, report: number[]): Promise<void> {
  try {
    await device.sendKeyboardData(report)
  } catch (error) {
    console.error('Error sending keyboard data:', error)
  }
}

async function sendMouse(_: IpcMainInvokeEvent, report: number[]): Promise<void> {
  try {
    await device.sendMouseData(report)
  } catch (error) {
    console.error('Error sending mouse data:', error)
  }
}
