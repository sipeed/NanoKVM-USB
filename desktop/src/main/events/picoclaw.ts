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
      const err = error as Error & { rateLimit?: { waitSeconds: number; waitTimeText: string; limitType?: string; limitValue?: number; resetAt?: string } }
      return {
        success: false,
        error: String(err.message || err),
        rateLimit: err.rateLimit || undefined
      }
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

  // Get supported providers list from picoclaw binary
  ipcMain.handle(IpcEvents.PICOCLAW_GET_PROVIDERS, async () => {
    try {
      const data = await manager.getProviders()
      return { success: true, ...data }
    } catch (error) {
      console.error('[IPC] Failed to get providers:', error)
      return { success: false, error: String(error), providers: [] }
    }
  })

  // Detect GitHub authentication via gh CLI
  ipcMain.handle(IpcEvents.PICOCLAW_DETECT_GITHUB_AUTH, () => {
    try {
      const result = manager.detectGitHubToken()
      return { success: true, ...result }
    } catch (error) {
      console.error('[IPC] Failed to detect GitHub auth:', error)
      return { success: false, found: false, token: null, user: null, error: String(error) }
    }
  })

  // Initiate GitHub authentication (spawns gh auth login --web)
  ipcMain.handle(IpcEvents.PICOCLAW_INITIATE_GITHUB_AUTH, async () => {
    try {
      if (!manager.isGhInstalled()) {
        return {
          success: false,
          error: 'gh CLIがインストールされていません。https://cli.github.com からインストールしてください。'
        }
      }
      const result = await manager.initiateGitHubAuth()
      return { success: true, ...result }
    } catch (error) {
      console.error('[IPC] Failed to initiate GitHub auth:', error)
      return { success: false, error: String(error) }
    }
  })

  // Cancel ongoing GitHub authentication
  ipcMain.handle(IpcEvents.PICOCLAW_CANCEL_GITHUB_AUTH, () => {
    manager.cancelGitHubAuth()
    return { success: true }
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
      return result
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
