import { ipcMain } from 'electron'
import { IpcEvents } from '@common/ipc-events'
import { PicoclawManager, PicoclawConfig } from '../picoclaw/manager'
import { ModelUpdater, ModelUpdateSchedule } from '../picoclaw/model-updater'

export function registerPicoclawHandlers(manager: PicoclawManager, modelUpdater: ModelUpdater): void {
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
  ipcMain.handle(IpcEvents.PICOCLAW_SEND_MESSAGE, async (_event, message: string, language?: string, sessionId?: string) => {
    try {
      const response = await manager.sendMessage(message, language || 'en', sessionId)
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

  // Start gateway (Telegram bot)
  ipcMain.handle(IpcEvents.PICOCLAW_START_GATEWAY, async () => {
    try {
      await manager.start()
      return { success: true }
    } catch (error) {
      console.error('[IPC] Failed to start gateway:', error)
      return { success: false, error: String(error) }
    }
  })

  // Stop gateway (Telegram bot)
  ipcMain.handle(IpcEvents.PICOCLAW_STOP_GATEWAY, async () => {
    try {
      await manager.stop()
      return { success: true }
    } catch (error) {
      console.error('[IPC] Failed to stop gateway:', error)
      return { success: false, error: String(error) }
    }
  })

  // Get gateway status
  ipcMain.handle(IpcEvents.PICOCLAW_GATEWAY_STATUS, () => {
    try {
      const status = manager.getStatus()
      return { success: true, status }
    } catch (error) {
      console.error('[IPC] Failed to get gateway status:', error)
      return { success: false, error: String(error) }
    }
  })

  // Get picoclaw version
  ipcMain.handle(IpcEvents.PICOCLAW_GET_VERSION, async () => {
    try {
      const version = await manager.getVersion()
      return { success: true, version }
    } catch (error) {
      console.error('[IPC] Failed to get picoclaw version:', error)
      return { success: false, error: String(error) }
    }
  })

  // Get model update schedule
  ipcMain.handle(IpcEvents.PICOCLAW_GET_MODEL_UPDATE_SCHEDULE, () => {
    try {
      const schedule = modelUpdater.getSchedule()
      return { success: true, schedule }
    } catch (error) {
      console.error('[IPC] Failed to get model update schedule:', error)
      return { success: false, error: String(error) }
    }
  })

  // Set model update schedule
  ipcMain.handle(
    IpcEvents.PICOCLAW_SET_MODEL_UPDATE_SCHEDULE,
    (_event, schedule: ModelUpdateSchedule) => {
      try {
        modelUpdater.setSchedule(schedule)
        return { success: true }
      } catch (error) {
        console.error('[IPC] Failed to set model update schedule:', error)
        return { success: false, error: String(error) }
      }
    }
  )

  // Trigger model list update now
  ipcMain.handle(IpcEvents.PICOCLAW_UPDATE_MODELS_NOW, async () => {
    try {
      const result = await modelUpdater.updateNow()
      return { success: true, ...result }
    } catch (error) {
      console.error('[IPC] Failed to update models:', error)
      return { success: false, error: String(error) }
    }
  })

  // Get model update status
  ipcMain.handle(IpcEvents.PICOCLAW_GET_MODEL_UPDATE_STATUS, () => {
    try {
      const status = modelUpdater.getStatus()
      return { success: true, status }
    } catch (error) {
      console.error('[IPC] Failed to get model update status:', error)
      return { success: false, error: String(error) }
    }
  })
}
