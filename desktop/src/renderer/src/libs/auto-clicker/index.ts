import { IpcEvents } from '@common/ipc-events'

const AUTO_CLICKER_INTERVAL = 5 * 60 * 1000 // 5 minutes in milliseconds
const IDLE_THRESHOLD = 30_000 // 30 seconds - only click when user is idle

let intervalId: NodeJS.Timeout | null = null
let lastMoveTime = Date.now()

// Update last move time when user interacts with mouse
export function updateAutoClickerActivity() {
  lastMoveTime = Date.now()
}

export function startAutoClicker() {
  if (intervalId) {
    console.log('[AutoClicker] Already running')
    return
  }

  console.log('[AutoClicker] Started (interval: 5 minutes, idle threshold: 30 seconds)')

  intervalId = setInterval(() => {
    const timeSinceLastMove = Date.now() - lastMoveTime
    
    // Only click if user has been idle for more than 30 seconds
    if (timeSinceLastMove > IDLE_THRESHOLD) {
      console.log('[AutoClicker] Sending left click (user idle)')
      
      // Send left button press (relative mode: 0x01, buttons: 0x01, dx: 0, dy: 0, wheel: 0)
      const pressReport = [0x01, 0x01, 0x00, 0x00, 0x00]
      window.electron.ipcRenderer.invoke(IpcEvents.SEND_MOUSE, pressReport)
        .then(() => {
          console.log('[AutoClicker] ✓ Click press sent successfully')
        })
        .catch((error) => {
          console.error('[AutoClicker] ✗ Failed to send click press:', error)
        })
      
      // Release after 50ms
      setTimeout(() => {
        const releaseReport = [0x01, 0x00, 0x00, 0x00, 0x00]
        window.electron.ipcRenderer.invoke(IpcEvents.SEND_MOUSE, releaseReport)
          .then(() => {
            console.log('[AutoClicker] ✓ Click release sent successfully')
          })
          .catch((error) => {
            console.error('[AutoClicker] ✗ Failed to send click release:', error)
          })
      }, 50)
    } else {
      console.log('[AutoClicker] Skipping click (user active)')
    }
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
