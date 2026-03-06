/**
 * IPC event handlers for TelegramService.
 *
 * TelegramService is agent-independent — it routes messages through
 * AgentRouter regardless of which agent is active.
 *
 * @see docs/multi-agent-spec.md Section 5.5
 */

import { ipcMain } from 'electron'
import { IpcEvents } from '@common/ipc-events'
import { TelegramService } from '../telegram/service'

export function registerTelegramHandlers(telegramService: TelegramService): void {
  // Start Telegram long-polling
  ipcMain.handle(IpcEvents.TELEGRAM_START, async () => {
    try {
      await telegramService.start()
      return { success: true }
    } catch (error) {
      console.error('[IPC] Failed to start TelegramService:', error)
      return { success: false, error: String(error) }
    }
  })

  // Stop Telegram long-polling
  ipcMain.handle(IpcEvents.TELEGRAM_STOP, async () => {
    try {
      await telegramService.stop()
      return { success: true }
    } catch (error) {
      console.error('[IPC] Failed to stop TelegramService:', error)
      return { success: false, error: String(error) }
    }
  })

  // Get Telegram status
  ipcMain.handle(IpcEvents.TELEGRAM_STATUS, () => {
    try {
      const status = telegramService.getStatus()
      return { success: true, status }
    } catch (error) {
      console.error('[IPC] Failed to get TelegramService status:', error)
      return { success: false, error: String(error) }
    }
  })
}
