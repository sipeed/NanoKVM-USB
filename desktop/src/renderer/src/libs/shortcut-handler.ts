import { IpcEvents } from '@common/ipc-events'
import { KeyboardReport } from './keyboard/keyboard'

/**
 * Send keyboard shortcut (e.g., Win+L, Ctrl+Alt+Del)
 * @param keys Array of key codes (e.g., ["MetaLeft", "KeyL"])
 */
export async function sendShortcut(keys: string[]): Promise<void> {
  const keyboardReport = new KeyboardReport()
  
  // Press all keys
  for (const key of keys) {
    const pressReport = keyboardReport.keyDown(key)
    await window.electron.ipcRenderer.invoke(IpcEvents.SEND_KEYBOARD, pressReport)
    await new Promise((r) => setTimeout(r, 20))
  }
  
  // Hold for a moment
  await new Promise((r) => setTimeout(r, 50))
  
  // Release all keys in reverse order
  for (let i = keys.length - 1; i >= 0; i--) {
    const releaseReport = keyboardReport.keyUp(keys[i])
    await window.electron.ipcRenderer.invoke(IpcEvents.SEND_KEYBOARD, releaseReport)
    await new Promise((r) => setTimeout(r, 20))
  }
  
  // Final release
  const finalRelease = keyboardReport.reset()
  await window.electron.ipcRenderer.invoke(IpcEvents.SEND_KEYBOARD, finalRelease)
}
