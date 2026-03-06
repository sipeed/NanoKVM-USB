/**
 * AgentRouter — dispatches calls to the active AI agent adapter.
 *
 * This is the single processing path for all message sources (Chat UI and Telegram).
 * Both channels call AgentRouter.sendMessage() which delegates to the active adapter.
 *
 * Intent detection (lock, login, screen capture) is centralized here so that
 * BOTH picoclaw and zeroclaw agents share the exact same bypass logic.
 * This prevents regressions where one agent works but the other doesn't.
 *
 * @see docs/nanoclaw-spec.md Section 5 (AgentAdapter / AgentRouter)
 * @see docs/nanoclaw-spec.md Section 11.3 (黒画面検出 & 自動ウェイク)
 */

import { AgentType, DEFAULT_AGENT_TYPE } from '@common/agent-types'
import { AgentAdapter, AgentConfigResult, AgentProvidersResult, SendMessageResult } from './adapter'
import { isLockIntent, isLoginIntent, isScreenCaptureIntent } from '@common/task-prompts'

/** API server port (shared constant) */
const API_PORT = 18792

export class AgentRouter {
  private activeType: AgentType = DEFAULT_AGENT_TYPE
  private adapters: Map<AgentType, AgentAdapter> = new Map()

  /** Register an adapter for a given agent type */
  register(adapter: AgentAdapter): void {
    this.adapters.set(adapter.type, adapter)
  }

  /** Get the currently active adapter */
  get active(): AgentAdapter {
    const adapter = this.adapters.get(this.activeType)
    if (!adapter) {
      throw new Error(`No adapter registered for agent type: ${this.activeType}`)
    }
    return adapter
  }

  /** Get current agent type */
  getType(): AgentType {
    return this.activeType
  }

  /** Switch active agent type */
  async setType(type: AgentType): Promise<void> {
    if (type === this.activeType) return

    if (!this.adapters.has(type)) {
      throw new Error(`No adapter registered for agent type: ${type}`)
    }

    // Cleanup current adapter
    await this.active.cleanup()

    this.activeType = type

    // Initialize new adapter
    await this.active.initialize()

    console.log(`[AgentRouter] Switched to ${type}`)
    // NOTE: TelegramService does not need restart — AgentRouter's target changed
  }

  /** Get version — delegates to active adapter */
  async getVersion(): Promise<string> {
    return this.active.getVersion()
  }

  /**
   * Send message — the single processing path for Chat UI and TelegramService.
   *
   * Intent detection is centralized here (not in individual adapters) so that
   * both picoclaw and zeroclaw get identical behavior for lock/login/screen_capture.
   *
   * Flow:
   *   1. Vault pending unlock → delegate to adapter (handles master password)
   *   2. Lock intent → call /v1/actions directly (LLM bypass)
   *   3. Login intent → call /v1/actions directly (LLM bypass)
   *   4. Screen capture intent → call /api/screen/analyze directly (LLM bypass)
   *   5. General message → delegate to active adapter (LLM conversation)
   *
   * Returns SendMessageResult with wasVaultUnlock metadata for TelegramService.
   */
  async sendMessage(message: string, language: string, sessionId?: string): Promise<SendMessageResult> {
    // ── 1. Vault pending unlock: adapter is expecting master password ────
    // Check BEFORE intent detection — "password123" might match isLoginIntent.
    if (this.active.isVaultPendingUnlock()) {
      const response = await this.active.sendMessage(message, language, sessionId)
      return { response, wasVaultUnlock: true }
    }

    // ── 2. Intent-based direct API calls (shared for ALL agents) ─────────
    // These bypass the LLM entirely for reliable execution.
    // @see docs/nanoclaw-spec.md Section 12.2 "Intent 検出 LLM バイパス"

    // Lock intent: "ロック", "lock" etc. (exclude login-related "ロック解除")
    if (isLockIntent(message) && !isLoginIntent(message)) {
      console.log('[AgentRouter] Detected lock intent — calling /v1/actions directly')
      const response = await this.callActionsApi({ action: 'nanokvm_lock' }, language)
      return { response, wasVaultUnlock: false }
    }

    // Login intent: "ログイン", "ロック解除", "sign in" etc.
    if (isLoginIntent(message)) {
      console.log('[AgentRouter] Detected login intent — calling /v1/actions directly')
      const response = await this.callActionsApi({ action: 'nanokvm_login' }, language)
      return { response, wasVaultUnlock: false }
    }

    // Screen capture intent: "画面確認して", "スクリーンショット" etc.
    if (isScreenCaptureIntent(message)) {
      console.log('[AgentRouter] Detected screen capture intent — calling /api/screen/analyze directly')
      const response = await this.callScreenAnalyzeApi(language)
      return { response, wasVaultUnlock: false }
    }

    // ── 3. General message: delegate to active adapter ────────────────────
    const response = await this.active.sendMessage(message, language, sessionId)
    return { response, wasVaultUnlock: false }
  }

  /** Get providers — delegates to active adapter */
  async getProviders(): Promise<AgentProvidersResult> {
    return this.active.getProviders()
  }

  /** Get config — delegates to active adapter */
  getConfig(): AgentConfigResult {
    return this.active.getConfig()
  }

  /** Update config — delegates to active adapter */
  updateConfig(config: Record<string, unknown>): void {
    this.active.updateConfig(config)
  }

  // ── Private: Direct API calls ───────────────────────────────────────────

  /**
   * Call /v1/actions API directly (bypassing the LLM).
   *
   * Both picoclaw's Go binary and zeroclaw's Rust binary would normally call
   * this API via their built-in tools. By calling it directly from the router,
   * we ensure consistent behavior regardless of which agent is active.
   *
   * Handles vault_locked responses by setting adapter's vault pending state.
   */
  private async callActionsApi(
    request: { action: string; params?: Record<string, unknown> },
    language: string
  ): Promise<string> {
    try {
      const responseBody = await this.httpPost('/v1/actions', request)
      const json = JSON.parse(responseBody) as Record<string, unknown>
      console.log(`[AgentRouter] /v1/actions response: success=${json.success}, action=${request.action}`)

      if (json.success) {
        const data = json.data as Record<string, unknown> | undefined
        return (data?.message as string) || (json.message as string) || `✅ ${request.action} を実行しました`
      } else {
        const errorCode = (json.error as string) || 'unknown_error'
        if (errorCode === 'vault_locked') {
          console.log('[AgentRouter] vault_locked — setting adapter vault pending state')
          this.active.setVaultPendingUnlock(true, `[${request.action}]`, language)
          return '🔐 マスターパスワードを入力してください'
        }
        return (json.user_message as string) || (json.message as string) || `❌ ${request.action} に失敗しました: ${errorCode}`
      }
    } catch (err) {
      console.error(`[AgentRouter] /v1/actions call failed for ${request.action}:`, err)
      return `❌ API呼び出しに失敗しました: ${err instanceof Error ? err.message : String(err)}`
    }
  }

  /**
   * Call /api/screen/analyze directly (screen capture + Vision LLM description).
   *
   * Bypasses the LLM for screen capture intent — some LLMs (e.g. gpt-4o-mini)
   * refuse to output JSON action syntax for screen_capture.
   *
   * The API server handles wake-up retry internally (spec §11.3):
   *   black/frozen frame → HID mouse+Space → 4s wait → re-capture (max 2 attempts)
   */
  private async callScreenAnalyzeApi(language: string): Promise<string> {
    try {
      const prompt =
        language === 'ja'
          ? '画面の内容を詳しく説明してください。何が表示されているか、重要な情報（テキスト、ウィンドウ、ダイアログなど）を教えてください。'
          : 'Describe the screen contents in detail. What is displayed, including important information like text, windows, dialogs, etc.'

      const responseBody = await this.httpPost('/api/screen/analyze', { prompt })
      const json = JSON.parse(responseBody) as Record<string, unknown>
      console.log(`[AgentRouter] /api/screen/analyze: success=${json.success}`)

      if (json.success) {
        const result = (json.result as string) || '画面の分析が完了しましたが、結果が空でした。'
        return `📷 ${result}`
      } else {
        const error = (json.error as string) || 'unknown'
        const rejectReason = (json.rejectReason as string) || ''
        if (error === 'Vision not configured') {
          return '📷 画面のキャプチャは成功しましたが、Vision LLM が設定されていないため内容を説明できません。設定から Vision LLM を有効にしてください。'
        }
        if (error === 'Screen capture failed') {
          if (rejectReason.includes('black/no-signal') || rejectReason.includes('zero bytes')) {
            return '❌ 画面キャプチャが黒フレームを返しました（ウェイク後もスリープ状態）。\n\nWindows PC がスリープから復帰できなかった可能性があります。PC の電源が入っているか、NanoKVM-USB が正しく接続されているか確認してください。'
          }
          if (rejectReason.includes('frozen')) {
            return '❌ ビデオストリームがフリーズしています。\n\nウェイク信号を送りましたが復帰できませんでした。NanoKVM-USB の接続と Windows PC の状態を確認してください。'
          }
          return `❌ 画面のキャプチャに失敗しました。NanoKVM-USB が接続されているか確認してください。(理由: ${rejectReason || 'unknown'})`
        }
        return `❌ 画面分析に失敗しました: ${error}`
      }
    } catch (err) {
      console.error('[AgentRouter] /api/screen/analyze call failed:', err)
      return `❌ 画面キャプチャAPIの呼び出しに失敗しました: ${err instanceof Error ? err.message : String(err)}`
    }
  }

  /**
   * HTTP POST helper for localhost API calls.
   * Shared by callActionsApi and callScreenAnalyzeApi to avoid duplication.
   */
  private async httpPost(path: string, body: Record<string, unknown>): Promise<string> {
    const http = await import('http')
    const payload = JSON.stringify(body)
    return new Promise<string>((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: API_PORT,
          path,
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
        },
        (res) => {
          let data = ''
          res.on('data', (chunk: Buffer | string) => { data += chunk })
          res.on('end', () => resolve(data))
        }
      )
      req.on('error', reject)
      req.write(payload)
      req.end()
    })
  }
}
