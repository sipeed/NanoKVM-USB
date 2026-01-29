import { IpcEvents } from '@common/ipc-events'

const AUTO_CLICKER_INTERVAL = 5 * 60 * 1000 // 5 minutes in milliseconds

let intervalId: NodeJS.Timeout | null = null

export function startAutoClicker() {
  if (intervalId) {
    console.log('[AutoClicker] Already running')
    return
  }

  console.log('[AutoClicker] Started (interval: 5 minutes)')

  intervalId = setInterval(() => {
    console.log('[AutoClicker] Sending left click')
    
    // Send left button press (relative mode: 0x01, buttons: 0x01, dx: 0, dy: 0, wheel: 0)
    const pressReport = [0x01, 0x01, 0x00, 0x00, 0x00]
    window.electron.ipcRenderer.invoke(IpcEvents.SEND_MOUSE, pressReport)
    
    // Release after 50ms
    setTimeout(() => {
      const releaseReport = [0x01, 0x00, 0x00, 0x00, 0x00]
      window.electron.ipcRenderer.invoke(IpcEvents.SEND_MOUSE, releaseReport)
    }, 50)
  }, AUTO_CLICKER_INTERVAL)
}

export function stopAutoClicker() {
  if (!intervalId) {
    console.log('[AutoClicker] Not running')
    return
  }

  clearInterval(intervalId)
  intervalId = null
  console.log('[AutoClicker] Stopped')
}

export function isAutoClickerRunning(): boolean {
  return intervalId !== null
}
