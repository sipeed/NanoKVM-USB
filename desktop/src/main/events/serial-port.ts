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
    const paths = ports.map((port) => port.path)
    console.log('[SerialPort] Available ports:', paths)

    return paths.sort((a, b) => {
      const aHasUSB = a.toLowerCase().includes('usb')
      const bHasUSB = b.toLowerCase().includes('usb')

      if (aHasUSB && !bHasUSB) return -1
      if (!aHasUSB && bHasUSB) return 1
      return a.localeCompare(b)
    })
  } catch (error) {
    console.error('[SerialPort] Error listing serial ports:', error)
    return []
  }
}

async function openSerialPort(
  e: IpcMainInvokeEvent,
  path: string,
  baudRate: number = 57600
): Promise<boolean> {
  try {
    console.log(`[SerialPort] Opening port: ${path} at ${baudRate} baud`)
    
    const onDisconnect = () => {
      console.log('[SerialPort] Device disconnected')
      e.sender.send(IpcEvents.SERIAL_PORT_DISCONNECTED)
    }

    await device.serialPort.init({ path, baudRate, onDisconnect })

    console.log('[SerialPort] ✓ Port opened successfully')
    e.sender.send(IpcEvents.OPEN_SERIAL_PORT_RSP, '')
    return true
  } catch (error) {
    console.error('[SerialPort] ✗ Error opening serial port:', error)
    const errorMsg = error instanceof Error ? error.message : 'Unknown error'
    e.sender.send(IpcEvents.OPEN_SERIAL_PORT_RSP, errorMsg)
    return false
  }
}

async function closeSerialPort(): Promise<boolean> {
  try {
    console.log('[SerialPort] Closing port')
    await device.serialPort.close()
    console.log('[SerialPort] ✓ Port closed')
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
    console.log('[SerialPort] Sending mouse data:', report)
    await device.sendMouseData(report)
    console.log('[SerialPort] ✓ Mouse data sent successfully')
  } catch (error) {
    console.error('[SerialPort] ✗ Error sending mouse data:', error)
    throw error
  }
}
