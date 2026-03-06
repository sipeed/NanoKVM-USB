/**
 * TelegramService — agent-independent Telegram Bot API communication.
 *
 * Runs long-polling in the Electron main process, receives messages from
 * Telegram users, routes them through AgentRouter.sendMessage() (the unified
 * processing path shared with Chat UI), and sends responses back.
 *
 * This replaces per-agent gateway subcommands. Agent switching does not
 * require TelegramService restart — only AgentRouter's target changes.
 *
 * @see docs/multi-agent-spec.md Section 5.5
 */

import { AgentRouter } from '../agent/router'

/** Telegram Bot API Update */
interface TelegramUpdate {
  update_id: number
  message?: {
    message_id: number
    from?: { id: number; first_name: string }
    chat: { id: number; type: string }
    text?: string
  }
}

export class TelegramService {
  private polling = false
  private pollAbortController: AbortController | null = null
  private lastUpdateId = 0
  private botToken = ''
  private allowedUserIds: string[] = []
  private agentRouter: AgentRouter

  constructor(agentRouter: AgentRouter) {
    this.agentRouter = agentRouter
  }

  /** Configure Telegram Bot settings */
  configure(config: { botToken: string; userId: string }): void {
    this.botToken = config.botToken
    this.allowedUserIds = config.userId ? [config.userId] : []
  }

  /** Start long-polling */
  async start(): Promise<void> {
    if (this.polling || !this.botToken) {
      if (!this.botToken) {
        console.warn('[TelegramService] Cannot start: no bot token configured')
      }
      return
    }
    this.polling = true
    console.log('[TelegramService] Starting long-polling...')
    // Start poll loop (non-blocking)
    this.pollLoop().catch((err) => {
      console.error('[TelegramService] Poll loop crashed:', err)
      this.polling = false
    })
  }

  /** Stop long-polling */
  async stop(): Promise<void> {
    this.polling = false
    if (this.pollAbortController) {
      this.pollAbortController.abort()
      this.pollAbortController = null
    }
    console.log('[TelegramService] Stopped.')
  }

  /** Get service status */
  getStatus(): { running: boolean } {
    return { running: this.polling }
  }

  // ── Private methods ──

  /** Main polling loop */
  private async pollLoop(): Promise<void> {
    while (this.polling) {
      try {
        const updates = await this.getUpdates()
        for (const update of updates) {
          await this.handleUpdate(update)
        }
      } catch (err) {
        if (!this.polling) break // Graceful shutdown
        console.error('[TelegramService] Poll error:', err)
        // Wait before retry on error
        await this.sleep(5000)
      }
    }
  }

  /** Call Telegram getUpdates API */
  private async getUpdates(): Promise<TelegramUpdate[]> {
    const url = `https://api.telegram.org/bot${this.botToken}/getUpdates`
    this.pollAbortController = new AbortController()

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        offset: this.lastUpdateId + 1,
        timeout: 30, // long-polling timeout (seconds)
        allowed_updates: ['message']
      }),
      signal: this.pollAbortController.signal
    })

    const data = (await resp.json()) as {
      ok: boolean
      description?: string
      result?: TelegramUpdate[]
    }
    if (!data.ok) throw new Error(`Telegram API error: ${data.description}`)
    return data.result || []
  }

  /** Handle received update — route through AgentRouter */
  private async handleUpdate(update: TelegramUpdate): Promise<void> {
    this.lastUpdateId = Math.max(this.lastUpdateId, update.update_id)
    const msg = update.message
    if (!msg?.text) return

    // User ID check
    const userId = String(msg.from?.id)
    if (this.allowedUserIds.length > 0 && !this.allowedUserIds.includes(userId)) {
      console.log(`[TelegramService] Ignored message from unauthorized user: ${userId}`)
      return
    }

    try {
      // === Unified processing path: AgentRouter.sendMessage() ===
      const sessionId = `telegram-${msg.chat.id}`
      const result = await this.agentRouter.sendMessage(msg.text, 'ja', sessionId)

      // Vault password handling (spec §5.4): when the user's message was treated
      // as a master password (LLM bypass), delete the message from Telegram
      // history to prevent the password from persisting in chat logs.
      if (result.wasVaultUnlock) {
        console.log('[TelegramService] Vault unlock message detected — deleting password message')
        await this.deleteMessage(msg.chat.id, msg.message_id)
      }

      await this.sendReply(msg.chat.id, result.response)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      console.error('[TelegramService] Message handling error:', errorMsg)
      await this.sendReply(msg.chat.id, `⚠️ エラーが発生しました: ${errorMsg}`)
    }
  }

  /**
   * Delete a message from Telegram chat history.
   * Used to remove master password messages after vault unlock.
   * @see picoclaw-lock-login-spec.md §5.4 — Telegram メッセージ即時削除
   */
  private async deleteMessage(chatId: number, messageId: number): Promise<void> {
    try {
      const url = `https://api.telegram.org/bot${this.botToken}/deleteMessage`
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, message_id: messageId })
      })
      const data = (await resp.json()) as { ok: boolean; description?: string }
      if (data.ok) {
        console.log(`[TelegramService] Password message ${messageId} deleted from chat ${chatId}`)
      } else {
        console.warn(`[TelegramService] Failed to delete message: ${data.description}`)
      }
    } catch (err) {
      console.error('[TelegramService] deleteMessage error:', err)
    }
  }

  /** Send reply to Telegram */
  private async sendReply(chatId: number, text: string): Promise<void> {
    try {
      const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text })
      })
    } catch (err) {
      console.error('[TelegramService] Failed to send reply:', err)
    }
  }

  /** Sleep helper */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
