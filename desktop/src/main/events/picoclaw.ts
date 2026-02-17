import { ipcMain } from 'electron'
import { IpcEvents } from '@common/ipc-events'
import { PicoclawManager, PicoclawConfig } from '../picoclaw/manager'

export function registerPicoclawHandlers(manager: PicoclawManager): void {
  // Start picoclaw gateway
  ipcMain.handle(IpcEvents.PICOCLAW_START, async () => {
    try {
      await manager.start()
      return { success: true }
    } catch (error) {
      console.error('[IPC] Failed to start picoclaw:', error)
      return { success: false, error: String(error) }
    }
  })

  // Stop picoclaw gateway
  ipcMain.handle(IpcEvents.PICOCLAW_STOP, async () => {
    try {
      await manager.stop()
      return { success: true }
    } catch (error) {
      console.error('[IPC] Failed to stop picoclaw:', error)
      return { success: false, error: String(error) }
    }
  })

  // Get picoclaw status
  ipcMain.handle(IpcEvents.PICOCLAW_STATUS, () => {
    try {
      const status = manager.getStatus()
      return { success: true, status }
    } catch (error) {
      console.error('[IPC] Failed to get picoclaw status:', error)
      return { success: false, error: String(error) }
    }
  })

  // Send message to picoclaw agent
  ipcMain.handle(IpcEvents.PICOCLAW_SEND_MESSAGE, async (_event, message: string, language?: string) => {
    try {
      const response = await manager.sendMessage(message, language || 'en')
      return { success: true, response }
    } catch (error) {
      console.error('[IPC] Failed to send message to picoclaw:', error)
      return { success: false, error: String(error) }
    }
  })

  // Get picoclaw config
  ipcMain.handle(IpcEvents.PICOCLAW_GET_CONFIG, () => {
    try {
      const config = manager.getConfig()
      return { success: true, config }
    } catch (error) {
      console.error('[IPC] Failed to get picoclaw config:', error)
      return { success: false, error: String(error) }
    }
  })

  // Update picoclaw config
  ipcMain.handle(IpcEvents.PICOCLAW_UPDATE_CONFIG, (_event, updates: Partial<PicoclawConfig>) => {
    try {
      manager.updateConfig(updates)
      return { success: true }
    } catch (error) {
      console.error('[IPC] Failed to update picoclaw config:', error)
      return { success: false, error: String(error) }
    }
  })
}
