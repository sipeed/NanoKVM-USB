import { spawn, ChildProcess } from 'child_process'
import { app, BrowserWindow } from 'electron'
import path from 'path'
import fs from 'fs'
import os from 'os'
import http from 'http'
import { isVisionConfigured, getVisionSetupMessage, analyzeScreenWithVision, getVerificationDelay } from './vision'

export interface PicoclawConfig {
  agents?: {
    defaults?: {
      workspace?: string
      restrict_to_workspace?: boolean
      provider?: string
      model?: string
      vision_provider?: string
      vision_model?: string
      max_tokens?: number
      temperature?: number
      max_tool_iterations?: number
    }
  }
  providers?: {
    [key: string]: {
      api_key?: string
      api_base?: string
    }
  }
  channels?: Record<string, unknown>
  tools?: Record<string, unknown>
  gateway?: {
    host?: string
    port?: number
  }
}

export interface PicoclawStatus {
  running: boolean
  pid?: number
  version?: string
}

export class PicoclawManager {
  private process: ChildProcess | null = null
  private configPath: string
  private picoclawBinary: string
  private recentApiCalls: Map<string, number> = new Map() // endpoint+body → timestamp for dedup
  private mainWindow: BrowserWindow | null = null

  constructor() {
    // picoclaw config path: ~/.picoclaw/config.json
    this.configPath = path.join(os.homedir(), '.picoclaw', 'config.json')
    
    // picoclaw binary path (in app resources)
    if (app.isPackaged) {
      // Production: app.asar.unpacked/resources/bin/picoclaw
      const appPath = app.getAppPath() // Points to app.asar
      const unpackedPath = appPath.replace('app.asar', 'app.asar.unpacked')
      this.picoclawBinary = path.join(unpackedPath, 'resources', 'bin', 'picoclaw')
    } else {
      // Development: desktop/resources/bin/picoclaw
      this.picoclawBinary = path.join(app.getAppPath(), 'resources', 'bin', 'picoclaw')
    }
    
    console.log('[Picoclaw] Binary path:', this.picoclawBinary)
  }

  /**
   * Set mainWindow reference for sending verification feedback
   */
  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window
  }

  /**
   * Initialize picoclaw (run onboard if needed)
   */
  async initialize(): Promise<void> {
    // Check if config exists
    if (!fs.existsSync(this.configPath)) {
      console.log('[Picoclaw] Config not found, running onboard...')
      await this.runOnboard()
    }
  }

  /**
   * Run picoclaw onboard command
   */
  private async runOnboard(): Promise<void> {
    return new Promise((resolve, reject) => {
      const onboard = spawn(this.picoclawBinary, ['onboard'], {
        stdio: 'pipe'
      })

      let output = ''
      onboard.stdout?.on('data', (data) => {
        output += data.toString()
      })

      onboard.stderr?.on('data', (data) => {
        console.error('[Picoclaw Onboard Error]', data.toString())
      })

      onboard.on('close', (code) => {
        if (code === 0) {
          console.log('[Picoclaw] Onboard complete:', output)
          resolve()
        } else {
          reject(new Error(`Onboard failed with code ${code}`))
        }
      })

      onboard.on('error', (err) => {
        reject(err)
      })
    })
  }

  /**
   * Start picoclaw gateway
   */
  async start(): Promise<void> {
    if (this.process) {
      throw new Error('Picoclaw is already running')
    }

    await this.initialize()

    console.log('[Picoclaw] Starting gateway...')
    this.process = spawn(this.picoclawBinary, ['gateway'], {
      stdio: 'pipe',
      env: {
        ...process.env,
        PICOCLAW_HOME: path.dirname(this.configPath)
      }
    })

    this.process.stdout?.on('data', (data) => {
      const text = data.toString()
      console.log('[Picoclaw Output]', text)
      this.interceptToolCallText(text)
    })

    this.process.stderr?.on('data', (data) => {
      const text = data.toString()
      console.error('[Picoclaw Error]', text)
      this.interceptToolCallText(text)
    })

    this.process.on('close', (code) => {
      console.log(`[Picoclaw] Process exited with code ${code}`)
      this.process = null
    })

    this.process.on('error', (err) => {
      console.error('[Picoclaw] Process error:', err)
      this.process = null
    })

    // Wait for process to start
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  /**
   * Stop picoclaw gateway
   */
  async stop(): Promise<void> {
    if (!this.process) {
      return
    }

    console.log('[Picoclaw] Stopping gateway...')
    this.process.kill()
    this.process = null

    // Wait for graceful shutdown
    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  /**
   * Auto-start gateway if Telegram is enabled and configured
   */
  async autoStartGatewayIfEnabled(): Promise<void> {
    try {
      const config = this.getConfig()
      const telegram = config.channels?.telegram as {
        enabled?: boolean
        token?: string
        allow_from?: string[]
      } | undefined

      if (
        telegram?.enabled &&
        telegram?.token &&
        telegram?.allow_from?.length
      ) {
        console.log('[Picoclaw] Telegram is enabled in config, auto-starting gateway...')
        await this.start()
        console.log('[Picoclaw] Gateway auto-started successfully')
      }
    } catch (err) {
      console.error('[Picoclaw] Failed to auto-start gateway:', err)
    }
  }

  /**
   * Get picoclaw version string
   */
  async getVersion(): Promise<string> {
    return new Promise((resolve) => {
      try {
        const proc = spawn(this.picoclawBinary, ['version'], { stdio: 'pipe' })
        let output = ''
        proc.stdout?.on('data', (data) => { output += data.toString() })
        proc.on('close', () => {
          // Parse "picoclaw v0.1.2-26-gc123ba8 (git: c123ba8f)" → "v0.1.2-26-gc123ba8"
          const match = output.match(/picoclaw\s+(v[^\s]+)/)
          resolve(match ? match[1] : 'unknown')
        })
        proc.on('error', () => resolve('unknown'))
      } catch {
        resolve('unknown')
      }
    })
  }

  /**
   * Get picoclaw status
   */
  getStatus(): PicoclawStatus {
    return {
      running: this.process !== null,
      pid: this.process?.pid
    }
  }

  /**
   * Get picoclaw config
   */
  getConfig(): PicoclawConfig {
    if (!fs.existsSync(this.configPath)) {
      return {}
    }

    try {
      const content = fs.readFileSync(this.configPath, 'utf-8')
      return JSON.parse(content)
    } catch (err) {
      console.error('[Picoclaw] Failed to read config:', err)
      return {}
    }
  }

  /**
   * Update picoclaw config
   */
  updateConfig(updates: Partial<PicoclawConfig>): void {
    const config = this.getConfig()
    const newConfig = { ...config, ...updates }

    // Ensure config directory exists
    const configDir = path.dirname(this.configPath)
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true })
    }

    fs.writeFileSync(this.configPath, JSON.stringify(newConfig, null, 2))
    console.log('[Picoclaw] Config updated')
  }

  /**
   * Send message to picoclaw agent
   */
  async sendMessage(message: string, language: string = 'en', sessionId?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const args = ['agent', '-m', message, '-l', language]
      if (sessionId) {
        args.push('-s', sessionId)
      }
      
      const agent = spawn(this.picoclawBinary, args, {
        stdio: 'pipe',
        env: {
          ...process.env,
          PICOCLAW_HOME: path.dirname(this.configPath)
        }
      })

      let output = ''
      let errorOutput = ''

      agent.stdout?.on('data', (data) => {
        output += data.toString()
      })

      agent.stderr?.on('data', (data) => {
        errorOutput += data.toString()
      })

      agent.on('close', (code) => {
        if (code === 0) {
          // Always run interceptor - dedup in callApi prevents double execution
          this.interceptToolCallText(output)

          // Strip action tags from the response shown to user
          const cleanResponse = this.stripActionTags(output)

          resolve(cleanResponse || output)
        } else {
          reject(new Error(`Agent command failed: ${errorOutput}`))
        }
      })

      agent.on('error', (err) => {
        reject(err)
      })
    })
  }

  /**
   * Strip <<nanokvm:...>> action tags and JSON tool calls from text,
   * returning only the human-readable message.
   */
  private stripActionTags(text: string): string {
    let cleaned = text
      // Remove <<nanokvm:...>> tags
      .replace(/<<nanokvm:\w+:[^>]+>>/g, '')
      // Remove any JSON object containing nanokvm_ (any key order)
      .replace(/\{[^{}]*nanokvm_\w+[^{}]*\{[^}]*\}[^{}]*\}/g, '')
      // Remove Python-like function calls
      .replace(/nanokvm_\w+\([^)]*\)/g, '')
      // Remove LLM preamble text
      .replace(/The function call th[ae]t? best answers the prompt is:?/gi, '')
      .replace(/I've completed processing\s*,?\s*but have no response to give\.?/gi, '')
      .replace(/Here is the function call:?/gi, '')
      .replace(/I will call:?/gi, '')
      .trim()

    // If nothing left after stripping, return a default message
    if (!cleaned) {
      cleaned = 'コマンドを実行しました'
    }

    return cleaned
  }

  /**
   * Intercept tool call text that LLM outputs instead of actual tool calls.
   * All formats are normalized to {toolName, params} then executed through a single path.
   */
  private interceptToolCallText(text: string): void {
    let matched = false

    // Format 1: <<nanokvm:action:params>> tags
    const tagPattern = /<<nanokvm:(\w+):([^>]+)>>/g
    let tagMatch: RegExpExecArray | null
    while ((tagMatch = tagPattern.exec(text)) !== null) {
      const toolName = tagMatch[1]
      const paramStr = tagMatch[2]
      console.log(`[Picoclaw Interceptor] Detected action tag: <<nanokvm:${toolName}:${paramStr}>>`)
      const params = this.parseActionTagParams(toolName, paramStr)
      this.executeToolCall(toolName, params)
      matched = true
    }

    // Format 2: JSON object containing nanokvm_ (any key order)
    if (!matched) {
      const jsonObjects = this.extractJsonObjects(text)
      for (const obj of jsonObjects) {
        const nameField = String(obj.name || obj.tool || '')
        const nanoMatch = nameField.match(/^nanokvm_(\w+)$/)
        if (!nanoMatch) continue

        const toolName = nanoMatch[1]
        const params = (obj.parameters || obj.args || obj.arguments || {}) as Record<string, unknown>
        console.log(`[Picoclaw Interceptor] Detected JSON tool call: nanokvm_${toolName}`, params)
        this.executeToolCall(toolName, params)
        matched = true
      }
    }

    // Format 3: Python-like function call: nanokvm_login(password='123')
    if (!matched) {
      const funcPattern = /nanokvm_(\w+)\(([^)]+)\)/g
      let funcMatch: RegExpExecArray | null
      while ((funcMatch = funcPattern.exec(text)) !== null) {
        const toolName = funcMatch[1]
        const argsStr = funcMatch[2]
        console.log(`[Picoclaw Interceptor] Detected function call: nanokvm_${toolName}(${argsStr})`)
        try {
          const params = this.parseFunctionArgs(argsStr)
          this.executeToolCall(toolName, params)
          matched = true
        } catch (err) {
          console.error(`[Picoclaw Interceptor] Failed to parse function args: ${argsStr}`, err)
        }
      }
    }

    if (!matched) {
      console.log('[Picoclaw Interceptor] No tool call patterns found in output')
    }
  }

  /**
   * Parse Python-like function arguments: password='123qweasd', keys=['Win','L']
   */
  private parseFunctionArgs(argsStr: string): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    // Match key=value pairs: password='123', keys=['Win','L'], username="admin"
    const pairPattern = /(\w+)\s*=\s*('[^']*'|"[^"]*"|\[[^\]]*\]|[^,]+)/g
    let pair: RegExpExecArray | null
    while ((pair = pairPattern.exec(argsStr)) !== null) {
      const key = pair[1]
      let value: string = pair[2].trim()
      // Strip surrounding quotes
      if ((value.startsWith("'") && value.endsWith("'")) ||
          (value.startsWith('"') && value.endsWith('"'))) {
        value = value.slice(1, -1)
      }
      // Try to parse arrays
      if (value.startsWith('[')) {
        try {
          result[key] = JSON.parse(value.replace(/'/g, '"'))
        } catch {
          result[key] = value
        }
      } else {
        result[key] = value
      }
    }
    return result
  }

  /**
   * Parse action tag params into a normalized params object.
   * e.g. "Win,L" for shortcut → {keys: ["Win","L"]}
   * e.g. "123qweasd" for login → {password: "123qweasd"}
   */
  private parseActionTagParams(toolName: string, paramStr: string): Record<string, unknown> {
    switch (toolName) {
      case 'shortcut': {
        const keys = paramStr.split(',').map((k) => k.trim()).filter(Boolean)
        return { keys }
      }
      case 'login': {
        const parts = paramStr.split(':')
        const result: Record<string, string> = { password: parts[0] }
        if (parts.length > 1 && parts[1]) result.username = parts[1]
        return result
      }
      case 'type':
        return { text: paramStr }
      case 'click':
        return { button: paramStr || 'left' }
      default:
        return { raw: paramStr }
    }
  }

  /**
   * Extract JSON objects from text by finding balanced braces.
   * Returns parsed objects; silently skips invalid JSON.
   */
  private extractJsonObjects(text: string): Record<string, unknown>[] {
    const results: Record<string, unknown>[] = []
    let i = 0
    while (i < text.length) {
      if (text[i] === '{') {
        let depth = 0
        let j = i
        while (j < text.length) {
          if (text[j] === '{') depth++
          else if (text[j] === '}') depth--
          if (depth === 0) break
          j++
        }
        if (depth === 0) {
          const candidate = text.slice(i, j + 1)
          try {
            const parsed = JSON.parse(candidate)
            if (typeof parsed === 'object' && parsed !== null) {
              results.push(parsed as Record<string, unknown>)
            }
          } catch {
            // Try fixing single quotes → double quotes
            try {
              const fixed = candidate.replace(/'/g, '"')
              const parsed = JSON.parse(fixed)
              if (typeof parsed === 'object' && parsed !== null) {
                results.push(parsed as Record<string, unknown>)
              }
            } catch {
              // Not valid JSON, skip
            }
          }
          i = j + 1
        } else {
          i++
        }
      } else {
        i++
      }
    }
    return results
  }

  /**
   * Single execution path for all detected tool calls.
   * All formats (action tags, JSON, function calls) converge here.
   */
  private async executeToolCall(toolName: string, params: Record<string, unknown>): Promise<void> {
    const API_BASE = 'http://127.0.0.1:18792'

    switch (toolName) {
      case 'shortcut': {
        const keys = this.normalizeKeysParam(params.keys)
        if (keys.length > 0) {
          // Detect Win+L lock command
          const normalizedKeys = keys.map((k) => k.toLowerCase())
          const hasWin = normalizedKeys.some((k) => ['win', 'windows', 'meta', 'cmd'].includes(k))
          const hasL = normalizedKeys.includes('l')

          if (hasWin && hasL) {
            // Pre-check: already locked?
            const preCheck = await this.preCheckScreenState('lock')
            if (preCheck === 'skip') return
          }

          this.callApi(`${API_BASE}/api/keyboard/shortcut`, { keys })

          if (hasWin && hasL) {
            this.scheduleScreenVerification('lock')
          }
        }
        break
      }
      case 'login': {
        const password = String(params.password || '')
        const username = params.username && String(params.username) !== '' ? String(params.username) : undefined
        if (password) {
          // Pre-check: already logged in?
          const preCheck = await this.preCheckScreenState('login')
          if (preCheck === 'skip') return

          const body: Record<string, string> = { password }
          if (username) body.username = username
          this.callApi(`${API_BASE}/api/keyboard/login`, body)

          // Schedule login verification after login sequence completes
          this.scheduleScreenVerification('login')
        }
        break
      }
      case 'type': {
        const text = String(params.text || '')
        if (text) {
          this.callApi(`${API_BASE}/api/keyboard/type`, { text })
        }
        break
      }
      case 'click': {
        const button = String(params.button || 'left')
        this.callApi(`${API_BASE}/api/mouse/click`, { button })
        break
      }
      default:
        console.log(`[Picoclaw] Unknown tool: nanokvm_${toolName}`)
    }
  }

  /**
   * Normalize keys parameter from various LLM formats
   */
  private normalizeKeysParam(keys: unknown): string[] {
    if (Array.isArray(keys)) {
      // Flatten "Win+L" elements to ["Win", "L"]
      const result: string[] = []
      for (const k of keys) {
        if (typeof k === 'string') {
          result.push(...k.split('+').map((s) => s.trim()).filter(Boolean))
        }
      }
      return result
    }

    if (typeof keys === 'string') {
      let str = keys.trim()
      // Handle stringified arrays like "['Win+L']" or "['Win', 'L']"
      if (str.startsWith('[')) {
        try {
          const parsed = JSON.parse(str.replace(/'/g, '"'))
          if (Array.isArray(parsed)) {
            return this.normalizeKeysParam(parsed)
          }
        } catch {
          // Strip brackets and quotes, then split
          str = str.replace(/[\[\]'"]/g, '')
        }
      }
      return str.split('+').map((s) => s.trim()).filter(Boolean)
    }

    return []
  }

  /**
   * Pre-check the current screen state before executing a lock or login command.
   * If the screen is already in the target state, sends a feedback message and
   * returns 'skip' to prevent unnecessary HID input.
   *
   * @param action - 'lock' (about to lock) or 'login' (about to login)
   * @returns 'skip' if already in target state, 'proceed' otherwise
   */
  private async preCheckScreenState(action: 'lock' | 'login'): Promise<'skip' | 'proceed'> {
    if (!isVisionConfigured()) {
      // Vision not configured — can't pre-check, just proceed with the action
      return 'proceed'
    }

    try {
      console.log(`[Picoclaw] Pre-checking screen state before ${action}...`)
      const captureResult = await this.callApiAsync(
        'http://127.0.0.1:18792/api/screen/capture',
        'GET'
      )

      if (!captureResult || !captureResult.image) {
        console.warn('[Picoclaw] Pre-check screen capture failed, proceeding with action')
        return 'proceed'
      }

      const prompt =
        'この画像はWindows PCの画面キャプチャです。以下の2つのうちどの状態か判定してください:\n\n' +
        '1. LOCK_SCREEN: ロック画面またはサインイン画面が表示されている（時計、日付、ユーザーアイコン、PIN入力欄等が見える）\n' +
        '2. DESKTOP: デスクトップ画面が表示されている（タスクバー、アイコン、ウィンドウ等が見える）\n\n' +
        '回答は以下のJSON形式のみで返してください（他のテキストは不要）:\n' +
        '{"status": "LOCK_SCREEN" or "DESKTOP", "detail": "判定理由を1文で"}'

      const analysis = await analyzeScreenWithVision(captureResult.image as string, prompt)
      console.log('[Picoclaw] Pre-check analysis:', analysis)

      // Parse status
      let status = 'UNKNOWN'
      try {
        const jsonMatch = analysis.match(/\{[^}]+\}/)
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0])
          status = parsed.status || 'UNKNOWN'
        }
      } catch {
        if (analysis.includes('LOCK_SCREEN') || analysis.includes('ロック')) {
          status = 'LOCK_SCREEN'
        } else if (analysis.includes('DESKTOP') || analysis.includes('デスクトップ')) {
          status = 'DESKTOP'
        }
      }

      // Check if already in target state
      if (action === 'lock' && status === 'LOCK_SCREEN') {
        console.log('[Picoclaw] Already locked, skipping Win+L')
        this.sendVerificationFeedback('🔒 すでにロック画面です。ロック操作は不要です。')
        return 'skip'
      }

      if (action === 'login' && status === 'DESKTOP') {
        console.log('[Picoclaw] Already logged in, skipping login sequence')
        this.sendVerificationFeedback('✅ すでにログインされています。ログイン操作は不要です。')
        return 'skip'
      }

      return 'proceed'
    } catch (err) {
      console.error(`[Picoclaw] Pre-check failed:`, err)
      // On error, proceed with the action (fail-open)
      return 'proceed'
    }
  }

  /**
   * Schedule screen verification after a lock or login command.
   * Waits for the operation to complete, captures the screen,
   * and analyzes it with Vision LLM (if configured).
   *
   * @param type - 'lock' for Win+L lock verification, 'login' for login verification
   */
  private scheduleScreenVerification(type: 'lock' | 'login'): void {
    // Get appropriate delay based on operation and Vision provider
    const config = this.getConfig()
    const visionProvider = config.agents?.defaults?.vision_provider || ''
    let delay: number

    if (type === 'lock') {
      // Lock is instant (Win+L), but Windows takes ~2-3s to show lock screen
      delay = visionProvider === 'ollama' ? 5000 : 3000
    } else {
      // Login sequence: Space(500ms)→Space(500ms)→Wait(3000ms)→Backspace×20(1200ms)
      //   →PIN typing(~1500ms)→Enter→Windows response(~3000ms) = ~10s
      delay = getVerificationDelay(visionProvider)
    }

    console.log(`[Picoclaw] ${type} verification scheduled in ${delay / 1000}s`)

    setTimeout(async () => {
      try {
        if (!isVisionConfigured()) {
          // Vision LLM not configured, send setup message
          console.log('[Picoclaw] Vision LLM not configured, sending setup message')
          this.sendVerificationFeedback(getVisionSetupMessage())
          return
        }

        // Request screen capture via API server
        console.log(`[Picoclaw] Capturing screen for ${type} verification...`)
        const captureResult = await this.callApiAsync(
          'http://127.0.0.1:18792/api/screen/capture',
          'GET'
        )

        if (!captureResult || !captureResult.image) {
          console.warn('[Picoclaw] Screen capture failed, skipping verification')
          return
        }

        // Build the appropriate prompt based on operation type
        let prompt: string
        if (type === 'lock') {
          prompt =
            'この画像はWindows PCの画面キャプチャです。以下の2つのうちどの状態か判定してください:\n\n' +
            '1. LOCK_SCREEN: ロック画面が表示されている（時計、日付、ユーザーアイコン、背景画像等が見える）\n' +
            '2. DESKTOP: デスクトップ画面が表示されている（タスクバー、アイコン、ウィンドウ等が見える）\n\n' +
            '回答は以下のJSON形式のみで返してください（他のテキストは不要）:\n' +
            '{"status": "LOCK_SCREEN" or "DESKTOP", "detail": "判定理由を1文で"}'
        } else {
          prompt =
            'この画像はWindows PCの画面キャプチャです。以下の3つのうちどの状態か判定してください:\n\n' +
            '1. LOGIN_SUCCESS: デスクトップ画面が表示されている（タスクバー、アイコン等が見える）\n' +
            '2. LOGIN_FAILED: PIN/パスワードエラーメッセージが表示されている（「PIN が正しくありません」「パスワードが正しくありません」等）\n' +
            '3. LOCK_SCREEN: ロック画面またはサインイン画面が表示されている（時計、ユーザーアイコン、入力欄等）\n\n' +
            '回答は以下のJSON形式のみで返してください（他のテキストは不要）:\n' +
            '{"status": "LOGIN_SUCCESS" or "LOGIN_FAILED" or "LOCK_SCREEN", "detail": "判定理由を1文で"}'
        }

        // Analyze with Vision LLM
        console.log(`[Picoclaw] Analyzing screen with Vision LLM for ${type}...`)
        const analysis = await analyzeScreenWithVision(captureResult.image as string, prompt)
        console.log('[Picoclaw] Vision analysis:', analysis)

        // Parse result and generate feedback
        let status = 'UNKNOWN'
        let detail = analysis

        try {
          const jsonMatch = analysis.match(/\{[^}]+\}/)
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0])
            status = parsed.status || 'UNKNOWN'
            detail = parsed.detail || analysis
          }
        } catch {
          // Fallback: keyword detection
          if (type === 'lock') {
            if (analysis.includes('LOCK_SCREEN') || analysis.includes('ロック')) {
              status = 'LOCK_SCREEN'
            } else if (analysis.includes('DESKTOP') || analysis.includes('デスクトップ')) {
              status = 'DESKTOP'
            }
          } else {
            if (analysis.includes('LOGIN_SUCCESS') || analysis.includes('デスクトップ')) {
              status = 'LOGIN_SUCCESS'
            } else if (analysis.includes('LOGIN_FAILED') || analysis.includes('正しくありません')) {
              status = 'LOGIN_FAILED'
            } else if (analysis.includes('LOCK_SCREEN') || analysis.includes('ロック')) {
              status = 'LOCK_SCREEN'
            }
          }
        }

        // Generate user-friendly feedback
        let feedback: string
        if (type === 'lock') {
          switch (status) {
            case 'LOCK_SCREEN':
              feedback = '🔒 ロック成功: ロック画面が確認できました。'
              if (detail && detail !== analysis) feedback += `\n（${detail}）`
              break
            case 'DESKTOP':
              feedback = '⚠️ ロック未完了: まだデスクトップ画面が表示されています。'
              if (detail && detail !== analysis) feedback += `\n（${detail}）`
              break
            default:
              feedback = `🔍 画面状態: ${detail}`
          }
        } else {
          switch (status) {
            case 'LOGIN_SUCCESS':
              feedback = '✅ ログイン成功: デスクトップ画面が確認できました。'
              if (detail && detail !== analysis) feedback += `\n（${detail}）`
              break
            case 'LOGIN_FAILED':
              feedback = '❌ ログイン失敗: PIN/パスワードが正しくないようです。正しいPINコードで再試行してください。'
              if (detail && detail !== analysis) feedback += `\n（${detail}）`
              // Dismiss the Windows error dialog by sending Enter key
              // ("PINが正しくありません" dialog has OK button focused by default)
              console.log('[Picoclaw] Dismissing PIN error dialog with Enter key...')
              this.callApi('http://127.0.0.1:18792/api/keyboard/shortcut', { keys: ['Enter'] })
              break
            case 'LOCK_SCREEN':
              feedback = '⚠️ ログイン未完了: まだサインイン画面が表示されています。PINの入力が完了していない可能性があります。'
              if (detail && detail !== analysis) feedback += `\n（${detail}）`
              break
            default:
              feedback = `🔍 画面状態: ${detail}`
          }
        }

        this.sendVerificationFeedback(feedback)
      } catch (err) {
        console.error(`[Picoclaw] ${type} verification failed:`, err)
        if (String(err).includes('VISION_NOT_CONFIGURED')) {
          this.sendVerificationFeedback(getVisionSetupMessage())
        }
      }
    }, delay)
  }

  /**
   * Send verification feedback to the user.
   * This sends the message to both the gateway (Telegram) and the main window (chat UI).
   */
  private sendVerificationFeedback(message: string): void {
    console.log(`[Picoclaw] Verification feedback: ${message.substring(0, 100)}...`)

    // Send to chat UI via IPC
    if (this.mainWindow) {
      this.mainWindow.webContents.send('picoclaw:verification-result', message)
    }

    // If gateway is running, the feedback will also be visible in Telegram
    // via the gateway's stdout interception (the message is logged)
    // For direct Telegram feedback, we'd need to add a gateway message API
  }

  /**
   * Make a synchronous-style HTTP request and return parsed JSON.
   */
  private callApiAsync(url: string, method: 'GET' | 'POST' = 'GET', body?: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    return new Promise((resolve) => {
      const urlObj = new URL(url)
      const postData = body ? JSON.stringify(body) : undefined

      const options: http.RequestOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname,
        method,
        headers: {
          'Content-Type': 'application/json'
        }
      }

      if (postData) {
        options.headers!['Content-Length'] = String(Buffer.byteLength(postData))
      }

      const req = http.request(options, (res) => {
        let data = ''
        res.on('data', (chunk) => { data += chunk })
        res.on('end', () => {
          try {
            resolve(JSON.parse(data))
          } catch {
            resolve(null)
          }
        })
      })

      req.on('error', (err) => {
        console.error('[Picoclaw] callApiAsync error:', err.message)
        resolve(null)
      })

      req.setTimeout(10000, () => {
        req.destroy()
        resolve(null)
      })

      if (postData) req.write(postData)
      req.end()
    })
  }

  /**
   * Make an HTTP POST request to the local API server.
   * Includes deduplication: if the same endpoint+body was called within
   * the last 15 seconds, skip the duplicate call.
   */
  private callApi(url: string, body: Record<string, unknown>): void {
    const urlObj = new URL(url)
    const postData = JSON.stringify(body)
    const dedupKey = `${urlObj.pathname}:${postData}`
    const now = Date.now()

    // Dedup: skip if same call was made within 15 seconds
    const lastCall = this.recentApiCalls.get(dedupKey)
    if (lastCall && now - lastCall < 15000) {
      console.log(`[Picoclaw Interceptor] Skipping duplicate API call: ${urlObj.pathname} (called ${now - lastCall}ms ago)`)
      return
    }
    this.recentApiCalls.set(dedupKey, now)

    // Clean old entries (older than 30s)
    for (const [key, ts] of this.recentApiCalls) {
      if (now - ts > 30000) this.recentApiCalls.delete(key)
    }

    console.log(`[Picoclaw Interceptor] Calling API: POST ${urlObj.pathname} ${postData}`)

    const req = http.request(
      {
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      },
      (res) => {
        let data = ''
        res.on('data', (chunk) => {
          data += chunk
        })
        res.on('end', () => {
          console.log(`[Picoclaw Interceptor] API response: ${res.statusCode} ${data}`)
        })
      }
    )

    req.on('error', (err) => {
      console.error(`[Picoclaw Interceptor] API call failed:`, err.message)
    })

    req.write(postData)
    req.end()
  }
}
