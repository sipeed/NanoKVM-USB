/**
 * ZeroclawAdapter — implements AgentAdapter for zeroclaw (Rust binary).
 *
 * Key differences from PicoclawAdapter:
 *   - Binary: `zeroclaw` (Rust, TOML config)
 *   - Version: `zeroclaw --version` → "zeroclaw 0.3.3" → "v0.3.3"
 *   - sendMessage: `zeroclaw agent -m "msg"` (no -l, no -s; manages history internally)
 *   - Config: TOML at ~/.zeroclaw/config.toml
 *   - No session ID concept — adapter manages conversation history
 *   - Providers: `zeroclaw providers`
 *
 * @see docs/multi-agent-spec.md Section 6
 */

import { spawn } from 'child_process'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { AgentAdapter, AgentConfigResult, AgentProvidersResult } from './adapter'
import { CommonAgentConfig } from '@common/agent-config'
import type { ConfigSyncService } from './config-sync'
import { buildNanokvmSystemContext, isLockIntent, isLoginIntent, isScreenCaptureIntent } from '@common/task-prompts'
import { vaultManager } from '../vault/manager'

/** Conversation history entry for context management */
interface ConversationEntry {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

/**
 * zeroclaw provider name → env var name mapping (matches zeroclaw src/providers/mod.rs).
 *
 * CRITICAL: zeroclaw treats API_KEY and ZEROCLAW_API_KEY as GLOBAL overrides that
 * replace config.api_key globally — every provider then uses that key, even if
 * provider-specific env vars (GROQ_API_KEY, etc.) are also set.
 *
 * To avoid this, spawnAgent() ONLY sets the env var for the ACTIVE provider.
 * See resolveActiveProviderEnv() for the per-invocation logic.
 */
const PROVIDER_ENV_VARS: Record<string, string> = {
  openrouter: 'OPENROUTER_API_KEY',
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  groq: 'GROQ_API_KEY',
  mistral: 'MISTRAL_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  xai: 'XAI_API_KEY',
  ollama: 'OLLAMA_API_KEY'
}

/** Providers that map to zeroclaw's `custom:URL` format */
const GITHUB_COPILOT_ALIASES = ['github-copilot', 'github_copilot', 'copilot']
const GITHUB_MODELS_BASE = 'https://models.inference.ai.azure.com'

export class ZeroclawAdapter implements AgentAdapter {
  readonly type = 'zeroclaw' as const
  private configPath: string
  private binaryPath: string
  private history: ConversationEntry[] = []
  private readonly maxHistoryLength = 4
  private configSync: ConfigSyncService | undefined
  private vaultPendingFilePath: string

  // ── Vault pending-unlock state ──────────────────────────────────────────
  // When performLogin returns vault_locked, the agent replies asking the user
  // for the master password. The NEXT message from the user is the master
  // password itself — we bypass the LLM and send it directly to the vault API.
  private vaultPendingUnlock = false
  private pendingLoginMessage: string | null = null
  private pendingLoginLanguage = 'en'

  constructor(configSync?: ConfigSyncService) {
    this.configSync = configSync
    // zeroclaw config path: ~/.zeroclaw/config.toml
    this.configPath = path.join(os.homedir(), '.zeroclaw', 'config.toml')
    // vault_pending persistence file (survives process restart, 5 min expiry)
    this.vaultPendingFilePath = path.join(os.homedir(), '.zeroclaw', 'vault_pending.json')
    // Restore vault_pending state from file (survives process restart)
    this.restoreVaultPendingState()

    // zeroclaw binary path (in app resources)
    if (app.isPackaged) {
      // Production: extraResources copies to Contents/Resources/bin/zeroclaw
      this.binaryPath = path.join(process.resourcesPath, 'bin', 'zeroclaw')
    } else {
      this.binaryPath = path.join(app.getAppPath(), 'resources', 'bin', 'zeroclaw')
    }

    console.log('[Zeroclaw] Binary path:', this.binaryPath)
    console.log('[Zeroclaw] Config path:', this.configPath)
  }

  // ── Vault pending persistence (spec: 5分で失効) ─────────────────────────

  /** Persist vault_pending_unlock state to file so it survives process restarts. */
  private saveVaultPendingState(): void {
    try {
      if (this.vaultPendingUnlock) {
        const state = {
          vaultPendingUnlock: true,
          pendingLoginMessage: this.pendingLoginMessage,
          pendingLoginLanguage: this.pendingLoginLanguage,
          timestamp: Date.now()
        }
        fs.writeFileSync(this.vaultPendingFilePath, JSON.stringify(state), 'utf-8')
        console.log('[Zeroclaw] Vault pending state saved to file')
      } else {
        if (fs.existsSync(this.vaultPendingFilePath)) {
          fs.unlinkSync(this.vaultPendingFilePath)
          console.log('[Zeroclaw] Vault pending state file removed')
        }
      }
    } catch (err) {
      console.error('[Zeroclaw] Failed to save vault pending state:', err)
    }
  }

  /** Restore vault_pending_unlock state from file on startup. Expires after 5 min. */
  private restoreVaultPendingState(): void {
    try {
      if (fs.existsSync(this.vaultPendingFilePath)) {
        const raw = fs.readFileSync(this.vaultPendingFilePath, 'utf-8')
        const state = JSON.parse(raw)
        if (state.timestamp && Date.now() - state.timestamp < 5 * 60 * 1000) {
          this.vaultPendingUnlock = state.vaultPendingUnlock ?? false
          this.pendingLoginMessage = state.pendingLoginMessage ?? null
          this.pendingLoginLanguage = state.pendingLoginLanguage ?? 'en'
          console.log('[Zeroclaw] Vault pending state restored from file')
        } else {
          console.log('[Zeroclaw] Vault pending state expired, ignoring')
          fs.unlinkSync(this.vaultPendingFilePath)
        }
      }
    } catch (err) {
      console.error('[Zeroclaw] Failed to restore vault pending state:', err)
    }
  }

  /** Check if vault_pending_unlock is active (used by AgentRouter for Telegram deleteMessage) */
  isVaultPendingUnlock(): boolean {
    return this.vaultPendingUnlock
  }

  /** Get version — `zeroclaw --version` → "zeroclaw 0.3.3" → "v0.3.3" */
  async getVersion(): Promise<string> {
    return new Promise((resolve) => {
      try {
        const proc = spawn(this.binaryPath, ['--version'], { stdio: 'pipe' })
        let output = ''
        proc.stdout?.on('data', (data) => {
          output += data.toString()
        })
        proc.on('close', () => {
          // Parse "zeroclaw 0.3.3" → "v0.3.3"
          const match = output.match(/zeroclaw\s+([\d][^\s]*)/)
          resolve(match ? `v${match[1]}` : 'unknown')
        })
        proc.on('error', () => resolve('unknown'))
      } catch {
        resolve('unknown')
      }
    })
  }

  /**
   * Send message — `zeroclaw agent -m "msg"`
   *
   * zeroclaw has no session ID concept. In one-shot mode (-m), each invocation
   * is stateless. We manage conversation history in the adapter and include
   * recent context in the prompt.
   */
  async sendMessage(message: string, language: string, _sessionId?: string): Promise<string> {
    // ── Vault pending unlock: intercept master password ─────────────────
    // Do NOT clear vaultPendingUnlock here — handleVaultPendingUnlock manages
    // the flag internally (keeps it true on wrong_password for retry).
    if (this.vaultPendingUnlock) {
      const unlockResult = await this.handleVaultPendingUnlock(message)
      if (unlockResult !== null) {
        // Unlock succeeded (or failed with explanation) — return the result message.
        // If there was a pending login request, retry it now.
        if (unlockResult.success && this.pendingLoginMessage) {
          const retryMsg = this.pendingLoginMessage
          const retryLang = this.pendingLoginLanguage || language
          this.pendingLoginMessage = null
          this.pendingLoginLanguage = 'en'
          this.saveVaultPendingState()
          // Small delay before retrying
          await new Promise((r) => setTimeout(r, 500))
          return this.sendMessage(retryMsg, retryLang, _sessionId)
        }
        this.pendingLoginMessage = null
        return unlockResult.message
      }
    }

    // ── Intent-based direct API call ────────────────────────────────────
    // zeroclaw's LLM doesn't have built-in NanoKVM tools (unlike picoclaw's Go
    // binary). When user intent is clearly lock/login, call /v1/actions directly
    // from the adapter — bypassing the LLM entirely for reliable execution.
    // This mirrors picoclaw's behavior where Go binary handles these via tools.

    // Lock intent: "ロック", "ロックして", "lock" etc.
    // Check isLockIntent first, then exclude login-related keywords to avoid
    // "ロック解除" being matched as lock intent.
    if (isLockIntent(message) && !isLoginIntent(message)) {
      console.log('[Zeroclaw] Detected lock intent — calling /v1/actions directly')
      return this.callActionsApiDirect({ action: 'nanokvm_lock' }, language)
    }

    // Login intent: "ログイン", "ロック解除", "sign in" etc.
    if (isLoginIntent(message)) {
      console.log('[Zeroclaw] Detected login intent — calling /v1/actions directly')
      return this.callActionsApiDirect({ action: 'nanokvm_login' }, language)
    }

    // Screen capture intent: "画面確認して", "スクリーンショット" etc.
    // Bypass LLM entirely — gpt-4o-mini refuses screen_capture in natural language.
    // Call /api/screen/analyze directly (capture + Vision LLM description).
    if (isScreenCaptureIntent(message)) {
      console.log('[Zeroclaw] Detected screen capture intent — calling /api/screen/analyze directly')
      return this.callScreenAnalyzeApiDirect(language)
    }

    this.history.push({ role: 'user', content: message, timestamp: Date.now() })

    // Build context-enriched prompt with conversation history + NanoKVM system context
    const contextPrompt = this.buildContextPrompt(message, language)
    const response = await this.spawnAgent(contextPrompt)

    this.history.push({ role: 'assistant', content: response, timestamp: Date.now() })
    this.trimHistory()

    // ── Detect vault_locked response from /v1/actions nanokvm_login ──────
    // zeroclaw calls POST /v1/actions { action: "nanokvm_login" } and gets back
    // { success: false, error: "vault_locked", user_message: "..." }.
    // The LLM will then ask the user for master password; we intercept the next
    // message to unlock the vault and retry automatically.
    if (
      response.includes('vault_locked') ||
      response.includes('マスターパスワード') ||
      response.includes('master password') ||
      response.includes('🔐')
    ) {
      console.log('[Zeroclaw] Detected vault_locked response — enabling vault pending unlock')
      this.vaultPendingUnlock = true
      this.pendingLoginMessage = message // retry the original request after unlock
      this.pendingLoginLanguage = language
      this.saveVaultPendingState()

      // Override the LLM's varied response with the standardized message that
      // Chat UI's isVaultPasswordMode checks for (exact match on "マスターパスワードを入力してください").
      // Without this, the LLM might say "マスターパスワードを教えてください" etc. which won't trigger the mask.
      return '🔐 マスターパスワードを入力してください'
    }

    return response
  }

  /**
   * Call /v1/actions API directly from the adapter (bypassing the LLM).
   *
   * zeroclaw's Rust binary has no built-in NanoKVM tools — it only has generic
   * tools (bash, filesystem). When we detect lock/login intent, we call the API
   * server directly, just like picoclaw's Go binary does via its built-in tools.
   *
   * If the API returns vault_locked (login without vault unlocked), we set
   * vaultPendingUnlock and return the standardized mask prompt.
   */
  private async callActionsApiDirect(
    request: { action: string; params?: Record<string, unknown> },
    language: string
  ): Promise<string> {
    try {
      const http = await import('http')
      const payload = JSON.stringify(request)

      const responseBody = await new Promise<string>((resolve, reject) => {
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port: 18792,
            path: '/v1/actions',
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
          },
          (res) => {
            let data = ''
            res.on('data', (chunk) => { data += chunk })
            res.on('end', () => resolve(data))
          }
        )
        req.on('error', reject)
        req.write(payload)
        req.end()
      })

      const json = JSON.parse(responseBody) as Record<string, unknown>
      console.log(`[Zeroclaw] /v1/actions response: success=${json.success}, action=${request.action}`)

      if (json.success) {
        // Successful action — return the server's message
        const data = json.data as Record<string, unknown> | undefined
        const message = (data?.message as string) || (json.message as string) || `✅ ${request.action} を実行しました`
        this.history.push({ role: 'user', content: `[${request.action}]`, timestamp: Date.now() })
        this.history.push({ role: 'assistant', content: message, timestamp: Date.now() })
        this.trimHistory()
        return message
      } else {
        // Failed — check for vault_locked
        const errorCode = (json.error as string) || 'unknown_error'
        if (errorCode === 'vault_locked') {
          console.log('[Zeroclaw] /v1/actions returned vault_locked — enabling vault pending unlock')
          this.vaultPendingUnlock = true
          this.pendingLoginMessage = `[${request.action}]`
          this.pendingLoginLanguage = language
          this.saveVaultPendingState()
          return '🔐 マスターパスワードを入力してください'
        }

        const userMessage = (json.user_message as string) || (json.message as string) || `❌ ${request.action} に失敗しました: ${errorCode}`
        return userMessage
      }
    } catch (err) {
      console.error(`[Zeroclaw] /v1/actions call failed for ${request.action}:`, err)
      return `❌ API呼び出しに失敗しました: ${err instanceof Error ? err.message : String(err)}`
    }
  }

  /**
   * Call /api/screen/analyze directly (screen capture + Vision LLM description).
   * Bypasses the LLM when screen capture intent is detected, because gpt-4o-mini
   * refuses to execute screen_capture via JSON in natural language responses.
   */
  private async callScreenAnalyzeApiDirect(language: string): Promise<string> {
    try {
      const http = await import('http')
      const prompt =
        language === 'ja'
          ? '画面の内容を詳しく説明してください。何が表示されているか、重要な情報（テキスト、ウィンドウ、ダイアログなど）を教えてください。'
          : 'Describe the screen contents in detail. What is displayed, including important information like text, windows, dialogs, etc.'
      const payload = JSON.stringify({ prompt })

      const responseBody = await new Promise<string>((resolve, reject) => {
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port: 18792,
            path: '/api/screen/analyze',
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
          },
          (res) => {
            let data = ''
            res.on('data', (chunk) => { data += chunk })
            res.on('end', () => resolve(data))
          }
        )
        req.on('error', reject)
        req.write(payload)
        req.end()
      })

      const json = JSON.parse(responseBody) as Record<string, unknown>
      console.log(`[Zeroclaw] /api/screen/analyze: success=${json.success}`)

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
          // Black/frozen: Windows PC likely in sleep → HID wake was attempted (server-side)
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
      console.error('[Zeroclaw] /api/screen/analyze call failed:', err)
      return `❌ 画面キャプチャAPIの呼び出しに失敗しました: ${err instanceof Error ? err.message : String(err)}`
    }
  }

  /**
   * Handle vault pending unlock: send master password to vault API.
   * Returns { success, message } or null if the call itself throws.
   */
  private async handleVaultPendingUnlock(
    masterPassword: string
  ): Promise<{ success: boolean; message: string } | null> {
    try {
      console.log('[Zeroclaw] Attempting vault unlock with user-provided master password')
      // Dynamic import to avoid circular deps (vault manager is in main process)
      // We call the vault API via HTTP to keep the adapter decoupled from main internals.
      const http = await import('http')
      const payload = JSON.stringify({ master_password: masterPassword.trim() })

      const responseBody = await new Promise<string>((resolve, reject) => {
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port: 18792,
            path: '/api/vault/unlock',
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
          },
          (res) => {
            let data = ''
            res.on('data', (chunk) => { data += chunk })
            res.on('end', () => resolve(data))
          }
        )
        req.on('error', reject)
        req.write(payload)
        req.end()
      })

      const json = JSON.parse(responseBody) as Record<string, unknown>
      if (json.success) {
        console.log('[Zeroclaw] Vault unlocked successfully')
        // Clear vault pending state
        this.vaultPendingUnlock = false
        this.saveVaultPendingState()
        return { success: true, message: '🔓 ボルトのロックを解除しました。ログインを再試行します...' }
      } else {
        const errMsg = (json.error as string) || 'unlock_failed'
        console.warn('[Zeroclaw] Vault unlock failed:', errMsg)
        if (errMsg === 'wrong_password') {
          // Keep vault_pending_unlock true so the user can retry (same as picoclaw).
          // The error message MUST contain "マスターパスワードを入力してください" so that
          // ChatUI's isVaultPasswordMode stays active and the next input remains masked.
          this.vaultPendingUnlock = true
          this.saveVaultPendingState()
          return { success: false, message: '🔐 パスワードが正しくありません。マスターパスワードを入力してください。' }
        }
        this.vaultPendingUnlock = false
        this.saveVaultPendingState()
        return { success: false, message: `❌ ボルトのロック解除に失敗しました: ${errMsg}` }
      }
    } catch (err) {
      console.error('[Zeroclaw] Failed to call vault unlock API:', err)
      return null
    }
  }

  /** Get providers — `zeroclaw providers` */
  async getProviders(): Promise<AgentProvidersResult> {
    return new Promise((resolve) => {
      try {
        const proc = spawn(this.binaryPath, ['providers'], { stdio: 'pipe' })
        let output = ''
        proc.stdout?.on('data', (data) => {
          output += data.toString()
        })
        proc.on('close', () => {
          try {
            const parsed = JSON.parse(output)
            resolve(parsed as AgentProvidersResult)
          } catch {
            console.error('[Zeroclaw] Failed to parse providers output:', output)
            resolve({ providers: [] })
          }
        })
        proc.on('error', (err) => {
          console.error('[Zeroclaw] Failed to run providers command:', err)
          resolve({ providers: [] })
        })
      } catch (err) {
        console.error('[Zeroclaw] Failed to spawn providers command:', err)
        resolve({ providers: [] })
      }
    })
  }

  /** Read config (TOML → common format) */
  getConfig(): AgentConfigResult {
    try {
      if (!fs.existsSync(this.configPath)) {
        return {}
      }
      const content = fs.readFileSync(this.configPath, 'utf-8')
      return this.parseToml(content)
    } catch (err) {
      console.error('[Zeroclaw] Failed to read config:', err)
      return {}
    }
  }

  /** Write config (common format → TOML) */
  updateConfig(config: Record<string, unknown>): void {
    try {
      const toml = this.convertToToml(config as Partial<CommonAgentConfig>)
      const configDir = path.dirname(this.configPath)
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true })
      }
      fs.writeFileSync(this.configPath, toml)
      console.log('[Zeroclaw] Config updated')
    } catch (err) {
      console.error('[Zeroclaw] Failed to update config:', err)
    }
  }

  /** Initialize — ensure config directory exists, verify binary */
  async initialize(): Promise<void> {
    const configDir = path.dirname(this.configPath)
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true })
    }
    // Check binary exists
    if (!fs.existsSync(this.binaryPath)) {
      console.warn(`[Zeroclaw] Binary not found at ${this.binaryPath}`)
    }
    // Clear conversation history on initialization
    this.history = []
    console.log('[Zeroclaw] Initialized')
  }

  /** Cleanup — clear conversation history and lock vault if unlocked.
   *
   * Called when switching to a different agent (AgentRouter.setType).
   * If vault was unlocked (e.g. user unlocked vault but login didn't complete),
   * we lock it to prevent the next agent from inheriting the unlocked state.
   */
  async cleanup(): Promise<void> {
    this.history = []

    // Clear vault pending state
    if (this.vaultPendingUnlock) {
      this.vaultPendingUnlock = false
      this.pendingLoginMessage = null
      this.saveVaultPendingState()
    }

    // Lock vault if still unlocked (prevents vault leaking across agent switches)
    if (vaultManager.isUnlocked()) {
      vaultManager.lock()
      console.log('[Zeroclaw] Vault locked on cleanup (was still unlocked)')
    }

    console.log('[Zeroclaw] Cleaned up')
  }

  // ── Private methods ──

  /**
   * Resolve the active provider's zeroclaw provider ID, model name, and env var for API key.
   *
   * This method reads the shared config to determine:
   * 1. What `--provider` and `--model` CLI args to pass to zeroclaw
   * 2. Which SINGLE env var to set for the API key (to avoid global override)
   *
   * IMPORTANT: zeroclaw treats API_KEY / ZEROCLAW_API_KEY as global overrides.
   * Setting them alongside provider-specific vars (GROQ_API_KEY) causes the
   * global key to win for ALL providers → 401 Unauthorized.
   * We therefore set ONLY the env var for the active provider.
   */
  private resolveActiveProviderEnv(): {
    providerArg: string | undefined
    modelArg: string | undefined
    envVars: Record<string, string>
  } {
    if (!this.configSync) return { providerArg: undefined, modelArg: undefined, envVars: {} }

    const sharedConfig = this.configSync.getConfig()
    const provider = sharedConfig.provider
    const model = sharedConfig.model
    if (!provider) return { providerArg: undefined, modelArg: undefined, envVars: {} }

    const isGitHubCopilot = GITHUB_COPILOT_ALIASES.includes(provider)
    const envVars: Record<string, string> = {}

    // Resolve zeroclaw provider ID
    let providerArg: string
    if (isGitHubCopilot) {
      // GitHub Models API → custom:URL format
      const apiBase =
        sharedConfig.providers['github-copilot']?.apiBase ||
        sharedConfig.providers['github_copilot']?.apiBase ||
        GITHUB_MODELS_BASE
      providerArg = `custom:${apiBase}`
      // custom: providers use API_KEY env var (NOT ZEROCLAW_API_KEY)
      const apiKey =
        sharedConfig.providers['github-copilot']?.apiKey ||
        sharedConfig.providers['github_copilot']?.apiKey ||
        ''
      if (apiKey) {
        envVars['API_KEY'] = apiKey
      }
    } else {
      providerArg = provider
      // Named providers use provider-specific env vars (GROQ_API_KEY, etc.)
      const envVarName = PROVIDER_ENV_VARS[provider]
      const apiKey = sharedConfig.providers[provider]?.apiKey || ''
      if (envVarName && apiKey) {
        envVars[envVarName] = apiKey
      }
    }

    // Resolve model name (strip picoclaw-style "provider/" prefix)
    let modelArg = model
    if (modelArg) {
      const prefix = provider + '/'
      if (modelArg.startsWith(prefix)) {
        modelArg = modelArg.slice(prefix.length)
      }
    }

    console.log(`[Zeroclaw] Resolved: provider=${providerArg} model=${modelArg} envKeys=${Object.keys(envVars).join(',')}`)
    return { providerArg, modelArg, envVars }
  }

  /**
   * Spawn zeroclaw agent subprocess (one-shot mode).
   *
   * Uses `--provider` and `--model` CLI args (spec §1) and injects
   * ONLY the active provider's API key env var to avoid global override.
   */
  private spawnAgent(message: string): Promise<string> {
    return new Promise((resolve, reject) => {
      // Check binary exists before spawning
      if (!fs.existsSync(this.binaryPath)) {
        reject(new Error(`zeroclaw binary not found at ${this.binaryPath}. Please install zeroclaw.`))
        return
      }

      const args = ['agent', '-m', message]

      // Add --provider and --model CLI args (spec §1: zeroclaw agent -m "msg" --provider <ID> --model <MODEL>)
      const { providerArg, modelArg, envVars: providerEnvVars } = this.resolveActiveProviderEnv()
      if (providerArg) {
        args.push('-p', providerArg)
      }
      if (modelArg) {
        args.push('--model', modelArg)
      }

      // Extend PATH for common tool locations
      const extraPaths = [
        '/usr/local/bin',
        '/opt/homebrew/bin',
        '/opt/local/bin',
        path.join(os.homedir(), '.local', 'bin'),
        path.join(os.homedir(), 'bin'),
        path.join(os.homedir(), '.cargo', 'bin')
      ]
      const envPATH = [process.env.PATH, ...extraPaths].filter(Boolean).join(':')

      // Clean process.env: remove any stale API key env vars to prevent leaking
      // keys from parent process that could override the intended provider.
      const cleanEnv = { ...process.env }
      delete cleanEnv.API_KEY
      delete cleanEnv.ZEROCLAW_API_KEY
      for (const envVarName of Object.values(PROVIDER_ENV_VARS)) {
        delete cleanEnv[envVarName]
      }

      const agentEnv = {
        ...cleanEnv,
        PATH: envPATH,
        ZEROCLAW_HOME: path.dirname(this.configPath),
        // Suppress INFO/DEBUG logs from zeroclaw (tracing respects RUST_LOG)
        RUST_LOG: process.env.RUST_LOG ?? 'warn',
        // ONLY inject env vars for the active provider (avoids global override)
        ...providerEnvVars
      }

      console.log(`[Zeroclaw] Spawning: ${args.slice(0, 5).join(' ')} ... (env: ${Object.keys(providerEnvVars).join(',')})`)

      const agent = spawn(this.binaryPath, args, {
        stdio: 'pipe',
        env: agentEnv
      })

      let output = ''
      let errorOutput = ''

      // Timeout: kill the process if it takes too long
      const TIMEOUT_MS = 90_000
      const timeoutId = setTimeout(() => {
        console.error(`[Zeroclaw] Agent timed out after ${TIMEOUT_MS / 1000}s — killing process`)
        agent.kill('SIGKILL')
        reject(new Error(`zeroclaw agent timed out after ${TIMEOUT_MS / 1000}s`))
      }, TIMEOUT_MS)

      agent.stdout?.on('data', (data) => {
        output += data.toString()
      })

      agent.stderr?.on('data', (data) => {
        errorOutput += data.toString()
      })

      agent.on('close', (code) => {
        clearTimeout(timeoutId)
        if (code === 0) {
          resolve(output.trim())
        } else {
          const errMsg = errorOutput.trim() || output.trim() || `zeroclaw exited with code ${code}`
          console.error('[Zeroclaw] Agent error:', errMsg)
          reject(new Error(errMsg))
        }
      })

      agent.on('error', (err) => {
        clearTimeout(timeoutId)
        reject(err)
      })
    })
  }

  /**
   * Build context prompt — include:
   *   1. NanoKVM system context (high-level nanokvm_* actions available)
   *   2. Recent conversation history for continuity in one-shot mode
   *   3. Current user message
   */
  private buildContextPrompt(message: string, language: string): string {
    const previousEntries = this.history.slice(0, -1) // exclude current message
    const lines: string[] = []

    // System context: NanoKVM capabilities (always prepend so LLM knows about actions)
    lines.push(buildNanokvmSystemContext(language))
    lines.push('')

    // Conversation history
    if (previousEntries.length > 0) {
      lines.push('[Previous conversation context]')
      for (const entry of previousEntries) {
        const role = entry.role === 'user' ? 'User' : 'Assistant'
        const content =
          entry.content.length > 200 ? entry.content.substring(0, 200) + '...' : entry.content
        lines.push(`${role}: ${content}`)
      }
      lines.push('')
    }

    lines.push(`[Current message (respond in ${language})]`)
    lines.push(message)

    return lines.join('\n')
  }

  /** Trim conversation history to max length */
  private trimHistory(): void {
    if (this.history.length > this.maxHistoryLength) {
      this.history = this.history.slice(-this.maxHistoryLength)
    }
  }

  /**
   * Convert CommonAgentConfig → TOML format for zeroclaw config.toml
   *
   * @see docs/multi-agent-spec.md Section 6.1 convertToToml
   */
  private convertToToml(config: Partial<CommonAgentConfig>): string {
    const lines: string[] = [
      '# zeroclaw config — auto-generated by NanoKVM-USB',
      '# Do not edit manually; changes will be overwritten by the app.',
      ''
    ]

    if (config.provider) {
      lines.push(`default_provider = "${config.provider}"`)
    }
    if (config.model) {
      lines.push(`default_model = "${config.model}"`)
    }
    if (config.temperature !== undefined) {
      lines.push(`default_temperature = ${config.temperature}`)
    }

    // Vision: if not using separate Vision LLM, enable vision on main model
    if (!config.useSeparateVisionLlm) {
      lines.push('model_support_vision = true')
    }

    lines.push('')

    // Provider configs — zeroclaw uses [model_providers.X]
    // Schema requires at least one of: name or base_url
    // api_key is stored in ProviderOverrideConfig (separate from ModelProviderConfig)
    if (config.providers) {
      for (const [name, prov] of Object.entries(config.providers)) {
        if (!prov.apiKey && !prov.apiBase) continue // skip empty providers
        lines.push(`[model_providers.${name}]`)
        lines.push(`name = "${name}"`) // required by zeroclaw schema
        if (prov.apiKey) {
          lines.push(`api_key = "${prov.apiKey}"`)
        }
        if (prov.apiBase) {
          lines.push(`base_url = "${prov.apiBase}"`)
        }
        lines.push('')
      }
    }

    // Browser computer_use config — points to NanoKVM API server
    lines.push('[browser]')
    lines.push('enabled = true')
    lines.push('backend = "computer_use"')
    lines.push('')
    lines.push('[browser.computer_use]')
    lines.push('endpoint = "http://127.0.0.1:18792/v1/actions"')
    lines.push('timeout_ms = 30000')
    lines.push('')

    // Agent settings — limit context to stay within 8000 token limit
    lines.push('[agent]')
    lines.push('compact_context = true')
    lines.push('max_tool_iterations = 5')
    lines.push('max_history_messages = 4')
    lines.push('')

    // Memory — disable auto-hydration to prevent old conversation history bloat
    lines.push('[memory]')
    lines.push('backend = "sqlite"')
    lines.push('auto_hydrate = false')
    lines.push('auto_save = false')
    lines.push('')

    // Channels — reduce timeout for better UX
    lines.push('[channels_config]')
    lines.push('cli = true')
    lines.push('message_timeout_secs = 90')
    lines.push('')

    // Autonomy settings
    lines.push('[autonomy]')
    lines.push('level = "full"')
    lines.push('allowed_commands = ["*"]')
    lines.push('')

    return lines.join('\n')
  }

  /**
   * Parse TOML content to a simple key-value config object.
   * This is a minimal parser sufficient for zeroclaw config reading.
   */
  private parseToml(content: string): AgentConfigResult {
    const result: Record<string, unknown> = {}
    let currentSection = ''

    for (const rawLine of content.split('\n')) {
      const line = rawLine.trim()

      // Skip empty lines and comments
      if (!line || line.startsWith('#')) continue

      // Section header
      const sectionMatch = line.match(/^\[([^\]]+)\]$/)
      if (sectionMatch) {
        currentSection = sectionMatch[1]
        continue
      }

      // Key-value pair
      const kvMatch = line.match(/^([^=]+?)\s*=\s*(.+)$/)
      if (kvMatch) {
        const key = kvMatch[1].trim()
        let value: unknown = kvMatch[2].trim()

        // Parse value types
        if (
          typeof value === 'string' &&
          value.startsWith('"') &&
          value.endsWith('"')
        ) {
          value = value.slice(1, -1)
        } else if (value === 'true') {
          value = true
        } else if (value === 'false') {
          value = false
        } else if (typeof value === 'string' && !isNaN(Number(value))) {
          value = Number(value)
        }

        const fullKey = currentSection ? `${currentSection}.${key}` : key
        result[fullKey] = value
      }
    }

    return result
  }
}
