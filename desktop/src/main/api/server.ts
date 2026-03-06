import { createServer, IncomingMessage, ServerResponse } from 'http'
import { BrowserWindow, ipcMain } from 'electron'
import { IpcEvents } from '@common/ipc-events'
import { isVisionConfigured, getVisionSetupMessage, analyzeScreenWithVision, getVisionLanguage } from '../picoclaw/vision'
import {
  VISION_PROMPT_LOCK,
  VISION_PROMPT_LOGIN,
  VISION_PROMPT_EMAIL_COMPOSE,
  VISION_PROMPT_EMAIL_SENT
} from '@common/task-prompts'
import { isFfmpegCaptureAvailable, captureFrameNative } from '../device/capture'
import { loginToWindows } from '../device/login'
import { vaultManager } from '../vault/manager'

export interface ApiServerConfig {
  port: number
  host: string
}

export class ApiServer {
  private server: ReturnType<typeof createServer> | null = null
  private config: ApiServerConfig
  private mainWindow: BrowserWindow | null = null

  constructor(config: ApiServerConfig = { port: 18792, host: '127.0.0.1' }) {
    this.config = config
  }

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window
  }

  async start(): Promise<void> {
    if (this.server) {
      throw new Error('API server is already running')
    }

    this.server = createServer((req, res) => {
      this.handleRequest(req, res).catch((err) => {
        console.error('[API Server] Error handling request:', err)
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Internal server error' }))
      })
    })

    return new Promise((resolve, reject) => {
      this.server!.listen(this.config.port, this.config.host, () => {
        console.log(`[API Server] Listening on ${this.config.host}:${this.config.port}`)
        resolve()
      })

      this.server!.on('error', (err) => {
        console.error('[API Server] Server error:', err)
        reject(err)
      })
    })
  }

  async stop(): Promise<void> {
    if (!this.server) {
      return
    }

    return new Promise((resolve, reject) => {
      this.server!.close((err) => {
        if (err) {
          reject(err)
        } else {
          console.log('[API Server] Stopped')
          this.server = null
          resolve()
        }
      })
    })
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    if (req.method === 'OPTIONS') {
      res.writeHead(200)
      res.end()
      return
    }

    const url = new URL(req.url || '', `http://${req.headers.host}`)

    if (req.method === 'POST' && url.pathname === '/api/keyboard/type') {
      await this.handleKeyboardType(req, res)
    } else if (req.method === 'POST' && url.pathname === '/api/keyboard/shortcut') {
      await this.handleKeyboardShortcut(req, res)
    } else if (req.method === 'POST' && url.pathname === '/api/keyboard/login') {
      await this.handleKeyboardLogin(req, res)
    } else if (req.method === 'POST' && url.pathname === '/api/mouse/click') {
      await this.handleMouseClick(req, res)
    } else if (req.method === 'POST' && url.pathname === '/api/mouse/move') {
      await this.handleMouseMove(req, res)
    } else if (req.method === 'GET' && url.pathname === '/api/screen/capture') {
      await this.handleScreenCapture(req, res)
    } else if (req.method === 'POST' && url.pathname === '/api/screen/verify-login') {
      await this.handleVerifyLogin(req, res)
    } else if (req.method === 'POST' && url.pathname === '/api/screen/verify') {
      await this.handleScreenVerify(req, res)
    } else if (req.method === 'POST' && url.pathname === '/api/screen/analyze') {
      await this.handleScreenAnalyze(req, res)
    } else if (req.method === 'GET' && url.pathname === '/api/status') {
      await this.handleStatus(req, res)
    } else if (req.method === 'POST' && url.pathname === '/api/vault/unlock') {
      await this.handleVaultUnlock(req, res)
    } else if (req.method === 'GET' && url.pathname === '/api/vault/credential') {
      await this.handleVaultGetCredential(req, res)
    } else if (req.method === 'GET' && url.pathname === '/api/vault/status') {
      await this.handleVaultStatus(req, res)
    } else if (req.method === 'POST' && url.pathname === '/v1/actions') {
      await this.handleComputerUseActions(req, res)
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Not found' }))
    }
  }

  private async readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = ''
      req.on('data', (chunk) => {
        body += chunk.toString()
      })
      req.on('end', () => {
        resolve(body)
      })
      req.on('error', reject)
    })
  }

  private async handleKeyboardType(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const body = await this.readBody(req)
      const { text } = JSON.parse(body)

      if (typeof text !== 'string') {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'text field is required' }))
        return
      }

      if (!this.mainWindow) {
        res.writeHead(503, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Main window not available' }))
        return
      }

      // Send to renderer process and wait for estimated typing completion.
      // Each character takes ~200ms (keyDown 30ms + keyUp 30ms + delay 150ms).
      // We wait here before returning 200 OK so that callers (picoclaw) can
      // safely proceed to field-verification after the response.
      console.log(`[API Server] keyboard/type: sending ${text.length} chars, waiting ~${text.length * 220 + 600}ms`)
      this.mainWindow.webContents.send('api:keyboard:type', text)
      await new Promise((r) => setTimeout(r, text.length * 220 + 600))

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: true }))
    } catch (err) {
      console.error('[API Server] Error in keyboard/type:', err)
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: String(err) }))
    }
  }

  private async handleKeyboardShortcut(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const body = await this.readBody(req)
      const parsed = JSON.parse(body)
      const keys = this.normalizeKeys(parsed.keys)

      if (!keys || keys.length === 0) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'keys array is required' }))
        return
      }

      console.log(`[API Server] Shortcut keys normalized: ${JSON.stringify(keys)}`)

      if (!this.mainWindow) {
        res.writeHead(503, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Main window not available' }))
        return
      }

      // Send to renderer process
      this.mainWindow.webContents.send('api:keyboard:shortcut', keys)

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: true }))
    } catch (err) {
      console.error('[API Server] Error in keyboard/shortcut:', err)
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: String(err) }))
    }
  }

  /**
   * Normalize keys parameter from various LLM-generated formats:
   *  - ["Win", "L"]         → ["Win", "L"]        (already correct)
   *  - ["Win+L"]            → ["Win", "L"]        (split on +)
   *  - "Win+L"              → ["Win", "L"]        (string, split on +)
   *  - "['Win+L']"          → ["Win", "L"]        (stringified array)
   *  - "['Win', 'L']"       → ["Win", "L"]        (stringified array)
   */
  private normalizeKeys(keys: unknown): string[] {
    // If it's a string, try to parse or split
    if (typeof keys === 'string') {
      let str = keys.trim()

      // Try JSON parse first: "['Win','L']" or '["Win","L"]'
      if (str.startsWith('[')) {
        try {
          // Replace single quotes with double quotes for JSON parsing
          const jsonStr = str.replace(/'/g, '"')
          const parsed = JSON.parse(jsonStr)
          if (Array.isArray(parsed)) {
            return this.flattenAndSplitKeys(parsed)
          }
        } catch {
          // Not valid JSON, strip brackets and split
          str = str.replace(/^\[|\]$/g, '').replace(/['"]/g, '').trim()
        }
      }

      // Plain string like "Win+L" or "Ctrl+Alt+Del"
      return str.split('+').map((k) => k.trim()).filter(Boolean)
    }

    // If it's already an array, flatten any "A+B" elements
    if (Array.isArray(keys)) {
      return this.flattenAndSplitKeys(keys)
    }

    return []
  }

  /**
   * Split array elements that contain "+" into separate keys
   * e.g. ["Win+L"] → ["Win", "L"], ["Ctrl", "Alt+Del"] → ["Ctrl", "Alt", "Del"]
   */
  private flattenAndSplitKeys(keys: unknown[]): string[] {
    const result: string[] = []
    for (const key of keys) {
      if (typeof key === 'string') {
        const parts = key.split('+').map((k) => k.trim()).filter(Boolean)
        result.push(...parts)
      }
    }
    return result
  }

  // OS names, bot names, and other strings that LLMs sometimes hallucinate as usernames
  private static readonly INVALID_USERNAMES = new Set([
    'windows', 'win', 'win10', 'win11', 'microsoft',
    'linux', 'ubuntu', 'macos', 'mac', 'android',
    'pc', 'computer', 'desktop', 'laptop',
    // Bot / AI names that LLMs use as usernames
    'picoclaw', 'assistant', 'bot', 'ai', 'chatbot', 'copilot', 'claude', 'gpt'
  ])

  // Valid Windows username: ASCII alphanumeric + limited special chars, no emoji
  private static readonly VALID_USERNAME_RE = /^[a-zA-Z0-9._\-@\\  ]+$/

  private static isValidUsername(username: string): boolean {
    if (!username || username.length === 0) return false
    // Reject if it matches known invalid names (case-insensitive, ignoring emoji/whitespace)
    const stripped = username.replace(/[^\w]/g, '').toLowerCase()
    if (ApiServer.INVALID_USERNAMES.has(stripped)) return false
    if (ApiServer.INVALID_USERNAMES.has(username.toLowerCase().trim())) return false
    // Reject if it contains non-ASCII characters (emoji, CJK, etc.)
    if (!ApiServer.VALID_USERNAME_RE.test(username)) return false
    return true
  }

  private async handleKeyboardLogin(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const body = await this.readBody(req)
      const { password: rawPassword, username: rawUsername } = JSON.parse(body)
      const result = await this.performLogin(rawPassword, rawUsername)
      if (!result.success) {
        const statusCode = result.errorCode === 'vault_locked' ? 403 : 400
        res.writeHead(statusCode, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          error: result.errorCode || 'login_failed',
          message: result.error,
          user_message: result.userMessage
        }))
        return
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: true }))
    } catch (err) {
      console.error('[API Server] Error in keyboard/login:', err)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: String(err) }))
    }
  }

  /**
   * Shared login implementation — called by both /api/keyboard/login (picoclaw)
   * and /v1/actions nanokvm_login (zeroclaw).
   *
   * Handles vault integration and username sanitization.
   */
  private async performLogin(
    rawPassword?: string,
    rawUsername?: string
  ): Promise<{ success: boolean; errorCode?: string; error?: string; userMessage?: string }> {
    let password: string
    let username: string

    if (vaultManager.isConfigured()) {
      if (!vaultManager.isUnlocked()) {
        console.log('[API Server] Vault is configured but locked — returning vault_locked error')
        return {
          success: false,
          errorCode: 'vault_locked',
          error: 'マスターパスワードが必要です',
          userMessage: '🔐 マスターパスワードを入力してください'
        }
      }
      const credential = vaultManager.getCredential()
      if (!credential?.pin) {
        return { success: false, errorCode: 'vault_empty', error: 'No credential stored in vault' }
      }
      password = credential.pin
      username = credential.username || ''
      console.log('[API Server] Using vault credential for login (PIN masked)')
    } else {
      if (typeof rawPassword !== 'string' || rawPassword === '') {
        return { success: false, errorCode: 'no_password', error: 'password field is required' }
      }
      password = rawPassword
      username = typeof rawUsername === 'string' ? rawUsername.trim() : ''
    }

    if (username && !ApiServer.isValidUsername(username)) {
      console.warn(`[API Server] Ignoring invalid username "${username}", using PIN-only mode`)
      username = ''
    }

    console.log('[API Server] Starting login sequence in main process (skipWake=true)...')
    await loginToWindows(password, username || undefined, true)
    console.log('[API Server] Login sequence completed')

    // Re-lock vault after login (one-time use per spec)
    if (vaultManager.isConfigured() && vaultManager.isUnlocked()) {
      vaultManager.lock()
      console.log('[API Server] Vault re-locked after login (one-time use)')
    }

    return { success: true }
  }

  /**
   * Shared email send implementation — called by /v1/actions nanokvm_send_email.
   * Automates Outlook on the remote Windows PC via keyboard sequences.
   *
   * ⚠️ ASCII only: HID keyboard cannot type Japanese/Unicode characters.
   */
  private async performSendEmail(
    to: string,
    subject: string,
    body: string
  ): Promise<{ success: boolean; status: string; message: string }> {
    if (!this.mainWindow) {
      return { success: false, status: 'NO_WINDOW', message: 'Main window not available' }
    }

    const send = (channel: string, data?: unknown): void => {
      this.mainWindow!.webContents.send(channel, data)
    }
    const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

    console.log(`[API Server] nanokvm_send_email: to=${to} subject=${subject}`)

    // Step 1: Open Outlook via Windows Search
    send('api:keyboard:shortcut', ['MetaLeft', 'KeyS'])
    await wait(1000)
    send('api:keyboard:type', 'outlook')
    await wait(500)
    send('api:keyboard:shortcut', ['Enter'])
    await wait(5000)

    // Step 2: Close search bar focus (so Ctrl+N goes to Outlook, not search)
    send('api:keyboard:shortcut', ['Escape'])
    await wait(500)

    // Step 3: New email
    send('api:keyboard:shortcut', ['ControlLeft', 'KeyN'])
    await wait(2000)

    // Step 4: Verify compose window is open
    const composeCapture = await this.requestScreenCapture()
    if (composeCapture.dataUrl && isVisionConfigured()) {
      const lang = getVisionLanguage()
      const composeAnalysis = await analyzeScreenWithVision(composeCapture.dataUrl, VISION_PROMPT_EMAIL_COMPOSE, lang)
      const isOpen = composeAnalysis.toUpperCase().includes('COMPOSE_OPEN') && !composeAnalysis.toUpperCase().includes('COMPOSE_NOT_OPEN')
      if (!isOpen) {
        // Retry once
        send('api:keyboard:shortcut', ['Escape'])
        await wait(500)
        send('api:keyboard:shortcut', ['ControlLeft', 'KeyN'])
        await wait(2000)
        const retryCapture = await this.requestScreenCapture()
        if (retryCapture.dataUrl) {
          const retryAnalysis = await analyzeScreenWithVision(retryCapture.dataUrl, VISION_PROMPT_EMAIL_COMPOSE, lang)
          if (!retryAnalysis.toUpperCase().includes('COMPOSE_OPEN') || retryAnalysis.toUpperCase().includes('COMPOSE_NOT_OPEN')) {
            return { success: false, status: 'COMPOSE_NOT_OPEN', message: '❌ 新規メール作成画面が開きませんでした。Outlookが起動しているか確認してください。' }
          }
        }
      }
    }

    // Step 5: Type recipient, subject, body
    send('api:keyboard:type', to)
    await wait(300)
    send('api:keyboard:shortcut', ['Tab'])
    await wait(300)
    send('api:keyboard:type', subject)
    await wait(300)
    send('api:keyboard:shortcut', ['Tab'])
    await wait(300)
    send('api:keyboard:type', body)
    await wait(500)

    // Step 6: Send
    send('api:keyboard:shortcut', ['ControlLeft', 'Enter'])
    await wait(3000)

    // Step 7: Verify sent
    if (isVisionConfigured()) {
      const lang = getVisionLanguage()
      const sentCapture = await this.requestScreenCapture()
      if (sentCapture.dataUrl) {
        const sentPrompt = 'Outlookでメール送信後の画面状態を確認してください。\n1行目に分類キーワードのみ回答:\n- SENT_SUCCESS — 送信完了（コンポーズウィンドウが消えた、送信済みフォルダに表示等）\n- SEND_ERROR — 送信エラーダイアログが表示されている\n- COMPOSE_OPEN — コンポーズウィンドウがまだ開いている'
        const sentAnalysis = await analyzeScreenWithVision(sentCapture.dataUrl, sentPrompt, lang)
        const upper = sentAnalysis.toUpperCase()
        if (upper.includes('SENT_SUCCESS')) {
          return { success: true, status: 'SENT_SUCCESS', message: '✅ メール送信完了' }
        } else if (upper.includes('SEND_ERROR')) {
          return { success: false, status: 'SEND_ERROR', message: '❌ 送信エラーが発生しました。Outlookの画面を確認してください。' }
        }
      }
    }

    return { success: true, status: 'SENT', message: '✅ メール送信操作を実行しました' }
  }

  private async handleMouseClick(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const body = await this.readBody(req)
      const { button, x, y } = JSON.parse(body)

      if (!this.mainWindow) {
        res.writeHead(503, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Main window not available' }))
        return
      }

      // Send to renderer process
      this.mainWindow.webContents.send('api:mouse:click', { button, x, y })

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: true }))
    } catch (err) {
      console.error('[API Server] Error in mouse/click:', err)
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: String(err) }))
    }
  }

  private async handleMouseMove(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const body = await this.readBody(req)
      const { x, y } = JSON.parse(body)

      if (!this.mainWindow) {
        res.writeHead(503, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Main window not available' }))
        return
      }

      // Send to renderer process
      this.mainWindow.webContents.send('api:mouse:move', { x, y })

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: true }))
    } catch (err) {
      console.error('[API Server] Error in mouse/move:', err)
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: String(err) }))
    }
  }

  private async handleStatus(_req: IncomingMessage, res: ServerResponse): Promise<void> {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        status: 'ok',
        version: '1.0.0',
        mainWindowReady: this.mainWindow !== null
      })
    )
  }

  /**
   * Capture screen from the HDMI video feed via renderer process.
   * Returns base64 JPEG data URL.
   */
  private async handleScreenCapture(_req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!this.mainWindow) {
      res.writeHead(503, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Main window not available' }))
      return
    }

    try {
      const result = await this.requestScreenCapture()
      if (result.dataUrl) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: true, image: result.dataUrl }))
      } else {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Failed to capture screen', reason: result.rejectReason || 'unknown' }))
      }
    } catch (err) {
      console.error('[API Server] Screen capture error:', err)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: String(err) }))
    }
  }

  /**
   * Analyze screen with Vision LLM using a custom prompt.
   * POST /api/screen/analyze
   * Body: { prompt: string }
   * Returns: { success, result }
   */
  private async handleScreenAnalyze(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!this.mainWindow) {
      res.writeHead(503, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Main window not available' }))
      return
    }
    try {
      const body = await this.readBody(req)
      const { prompt } = JSON.parse(body) as { prompt: string }
      if (!prompt) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'prompt is required' }))
        return
      }
      if (!isVisionConfigured()) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: false, error: 'Vision not configured' }))
        return
      }
      const capture = await this.requestScreenCapture()
      if (!capture.dataUrl) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: false, error: 'Screen capture failed', rejectReason: capture.rejectReason || 'unknown' }))
        return
      }
      const lang = getVisionLanguage()
      const result = await analyzeScreenWithVision(capture.dataUrl, prompt, lang)
      console.log('[API Server] /api/screen/analyze result:', result)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: true, result }))
    } catch (err) {
      console.error('[API Server] /api/screen/analyze error:', err)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: String(err) }))
    }
  }

  /**
   * Verify login result by capturing screen and analyzing with Vision LLM.
   * Uses the separately configured Vision LLM (not the chat LLM).
   */
  private async handleVerifyLogin(_req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!this.mainWindow) {
      res.writeHead(503, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Main window not available' }))
      return
    }

    try {
      // Check Vision LLM configuration
      if (!isVisionConfigured()) {
        const setupMessage = getVisionSetupMessage()
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          success: false,
          visionConfigured: false,
          recommendation: setupMessage
        }))
        return
      }

      // Capture screen
      const dataUrl = (await this.requestScreenCapture()).dataUrl
      if (!dataUrl) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Failed to capture screen' }))
        return
      }

      // Analyze with Vision LLM
      const lang = getVisionLanguage()
      const prompt = 
        'この画像はPCの画面キャプチャです。以下の3つのうちどの状態か判定してください:\n\n' +
        '1. LOGIN_SUCCESS: デスクトップ画面が表示されている\n' +
        '   - Windows: タスクバー（画面下部のアイコンバー）が見える\n' +
        '   - macOS: メニューバー（画面上部）とDock（画面下部のアイコンバー）が見える\n' +
        '2. LOGIN_FAILED: PIN/パスワードエラーメッセージが表示されている（「PIN が正しくありません」「パスワードが正しくありません」等）\n' +
        '3. LOCK_SCREEN: ロック画面またはサインイン画面が表示されている（時計、ユーザーアイコン、入力欄等）\n\n' +
        '回答は以下のJSON形式のみで返してください（他のテキストは不要）:\n' +
        '{"status": "LOGIN_SUCCESS" or "LOGIN_FAILED" or "LOCK_SCREEN", "detail": "判定理由を1文で"}'

      const analysis = await analyzeScreenWithVision(dataUrl, prompt, lang)
      console.log('[API Server] Vision analysis result:', analysis)

      // Parse the Vision response
      let status = 'UNKNOWN'
      let detail = analysis

      try {
        // Try to extract JSON from the response
        const jsonMatch = analysis.match(/\{[^}]+\}/)
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0])
          status = parsed.status || 'UNKNOWN'
          detail = parsed.detail || analysis
        }
      } catch {
        // If JSON parsing fails, try keyword matching
        if (analysis.includes('LOGIN_SUCCESS') || analysis.includes('デスクトップ')) {
          status = 'LOGIN_SUCCESS'
        } else if (analysis.includes('LOGIN_FAILED') || analysis.includes('正しくありません') || analysis.includes('incorrect')) {
          status = 'LOGIN_FAILED'
        } else if (analysis.includes('LOCK_SCREEN') || analysis.includes('ロック')) {
          status = 'LOCK_SCREEN'
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        success: true,
        visionConfigured: true,
        status,
        detail
      }))
    } catch (err) {
      console.error('[API Server] Verify login error:', err)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: String(err) }))
    }
  }

  /**
   * Unified screen verification endpoint.
   * Used by both Go-side NanoKVM tools and desktop-side interceptor.
   *
   * POST /api/screen/verify
   * Body: { action: "lock" | "login" }
   * Returns: { success, visionConfigured, status, detail, feedback }
   */
  private async handleScreenVerify(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!this.mainWindow) {
      res.writeHead(503, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Main window not available' }))
      return
    }

    try {
      const body = await this.readBody(req)
      const { action, context } = JSON.parse(body) as {
        action: 'lock' | 'login' | 'status' | 'email_compose' | 'email_sent' | 'email_to_field' | 'email_subject_field' | 'email_body_field' | 'email_outlook_active' | 'email_ime_mode'
        context?: string
      }

      if (
        action !== 'lock' &&
        action !== 'login' &&
        action !== 'status' &&
        action !== 'email_compose' &&
        action !== 'email_sent' &&
        action !== 'email_to_field' &&
        action !== 'email_subject_field' &&
        action !== 'email_body_field' &&
        action !== 'email_outlook_active' &&
        action !== 'email_ime_mode'
      ) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            error: 'action must be "lock", "login", "status", "email_compose", "email_sent", "email_to_field", "email_subject_field", "email_body_field", "email_outlook_active", or "email_ime_mode"'
          })
        )
        return
      }

      // Check Vision LLM configuration
      console.log('[API Server] Screen verify: action=' + action + ', checking Vision config...')
      if (!isVisionConfigured()) {
        const setupMessage = getVisionSetupMessage()
        console.log('[API Server] Screen verify: Vision NOT configured')
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          success: false,
          visionConfigured: false,
          status: 'UNKNOWN',
          detail: '',
          feedback: setupMessage
        }))
        return
      }
      console.log('[API Server] Screen verify: Vision is configured, proceeding...')

      // Capture screen
      console.log('[API Server] Screen verify: requesting screen capture via IPC...')
      let captureResult = await this.requestScreenCapture()
      let dataUrl = captureResult.dataUrl
      console.log(`[API Server] Screen verify: capture result = ${dataUrl ? `data(${Math.round(dataUrl.length / 1024)}KB)` : 'null'}${captureResult.rejectReason ? ` reason=${captureResult.rejectReason}` : ''}`)

      // If black screen detected, wake the PC with mouse click + keyboard and retry
      // Try up to 2 wake attempts — some PCs need keyboard input for S3 sleep,
      // and HDMI signal re-sync can take several seconds.
      const MAX_WAKE_ATTEMPTS = 2
      const isSleepScreen = (reason?: string): boolean =>
        !!(reason?.includes('black/no-signal') || reason?.includes('solid-color/sleep') || reason?.includes('zero bytes'))
      for (let attempt = 1; attempt <= MAX_WAKE_ATTEMPTS && !dataUrl && isSleepScreen(captureResult.rejectReason); attempt++) {
        console.log(`[API Server] Screen verify: sleep/black screen detected, wake attempt ${attempt}/${MAX_WAKE_ATTEMPTS}...`)
        this.mainWindow!.webContents.send('api:mouse:wake')
        // Wait for PC to wake and HDMI signal to stabilize (4s accounts for S3 resume + HDMI sync)
        await new Promise((r) => setTimeout(r, 4000))
        console.log(`[API Server] Screen verify: retrying capture after wake attempt ${attempt}...`)
        captureResult = await this.requestScreenCapture()
        dataUrl = captureResult.dataUrl
        console.log(`[API Server] Screen verify: retry ${attempt} result = ${dataUrl ? `data(${Math.round(dataUrl.length / 1024)}KB)` : 'null'}${captureResult.rejectReason ? ` reason=${captureResult.rejectReason}` : ''}`)
      }

      if (!dataUrl) {
        // Return structured response — differentiate black/sleep screen from no video stream
        const isBlackOrSleep = isSleepScreen(captureResult.rejectReason)
        const isSolidColor = captureResult.rejectReason?.includes('solid-color/sleep')
        const detail = isBlackOrSleep
          ? isSolidColor
            ? 'Screen capture returned a solid uniform color. The PC display is likely in sleep/standby mode (HDMI capture card outputting default frame).'
            : 'Screen capture returned a black frame. The PC may be in sleep/standby mode, or the HDMI signal may not have stabilized yet.'
          : 'No video stream available. The video feed is not active.'
        const feedback = isBlackOrSleep
          ? '🖥️ 画面がスリープ状態です。マウスクリックとキーボード入力でスリープ復帰を試みましたが画面が変わりませんでした。PCの電源が入っていることを確認してください。'
          : '📹 映像がありません。PCがNanoKVM-USBに接続されていて、ストリーミングが開始されていることを確認してください。'
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          success: false,
          visionConfigured: true,
          status: isBlackOrSleep ? 'BLACK_SCREEN' : 'NO_VIDEO',
          detail,
          feedback
        }))
        return
      }

      // Build prompt based on action type
      // Language-aware prompts: use user's configured language for response text
      const lang = getVisionLanguage()
      const langInstruction = lang === 'ja' ? '\n\n日本語で回答してください。' 
        : lang === 'zh' ? '\n\n请用中文回答。'
        : lang === 'ko' ? '\n\n한국어로 답변해 주세요.'
        : lang === 'de' ? '\n\nBitte antworten Sie auf Deutsch.'
        : lang ? `\n\nRespond in the user's language (${lang}).`
        : ''
      let prompt: string
      if (action === 'lock') {
        prompt = VISION_PROMPT_LOCK + langInstruction
      } else if (action === 'login') {
        prompt = VISION_PROMPT_LOGIN + langInstruction
      } else if (action === 'email_compose') {
        prompt = VISION_PROMPT_EMAIL_COMPOSE + langInstruction
      } else if (action === 'email_sent') {
        prompt = VISION_PROMPT_EMAIL_SENT + langInstruction
      } else if (action === 'email_outlook_active') {
        prompt =
          'Is Microsoft Outlook the active, frontmost window on this Windows screen?\n\n' +
          'Signs Outlook IS active:\n' +
          '- Outlook navigation pane visible (Inbox / Sent / Drafts folder list on left side)\n' +
          '- Email list or reading pane visible in center or right area\n' +
          '- Outlook title bar or blue ribbon toolbar visible at top\n\n' +
          'Signs Outlook is NOT active:\n' +
          '- Windows Search bar / Cortana / Start menu overlay is covering the screen\n' +
          '- A different application window is frontmost (browser, File Explorer, etc.)\n' +
          '- Only desktop, taskbar, or lock/sign-in screen is visible\n\n' +
          'Answer on line 1 with ONLY one of these keywords:\n' +
          '- OUTLOOK_ACTIVE   — Outlook is the frontmost/active window\n' +
          '- OUTLOOK_INACTIVE — Something else is in front; Outlook is not the active window\n' +
          'Line 2+: one sentence description of what is currently visible.' + langInstruction
      } else if (action === 'email_to_field') {
        const expected = context || '(expected content unknown)'
        prompt =
          `Examine the Microsoft Outlook compose window. Is the To/宛先 field showing the email address "${expected}"?\n\n` +
          'Answer on line 1 with ONLY one of these keywords:\n' +
          `- FIELD_CORRECT — The To field clearly shows "${expected}"\n` +
          `- FIELD_WRONG   — The To field shows different content or is different from "${expected}"\n` +
          '- FIELD_EMPTY   — The To field appears empty\n' +
          'Line 2+: one sentence description of what the To field currently shows.' + langInstruction
      } else if (action === 'email_subject_field') {
        const expected = context || '(expected content unknown)'
        prompt =
          `Examine the Microsoft Outlook compose window. Is the Subject/件名 field showing the exact text "${expected}"?\n\n` +
          'Answer on line 1 with ONLY one of these keywords:\n' +
          `- FIELD_CORRECT — The Subject field clearly shows "${expected}"\n` +
          `- FIELD_WRONG   — The Subject field shows different content from "${expected}"\n` +
          '- FIELD_EMPTY   — The Subject field appears empty\n' +
          'Line 2+: one sentence description of what the Subject field currently shows.' + langInstruction
      } else if (action === 'email_body_field') {
        const expected = context || '(expected content unknown)'
        prompt =
          `Examine the Microsoft Outlook compose window. Does the email body area contain the text "${expected}"?\n\n` +
          'Answer on line 1 with ONLY one of these keywords:\n' +
          `- FIELD_CORRECT — The body area clearly contains "${expected}"\n` +
          `- FIELD_WRONG   — The body area shows different content from "${expected}"\n` +
          '- FIELD_EMPTY   — The body area appears empty\n' +
          'Line 2+: one sentence description of what the body area currently shows.' + langInstruction
      } else if (action === 'email_ime_mode') {
        prompt =
          'Look at the Windows taskbar at the bottom-right area of the screen.\n' +
          'Is the Japanese IME (Input Method Editor) currently in JAPANESE mode (showing \"あ\" or \"あ\" icon) ' +
          'or in ASCII/English mode (showing \"A\" or \"英\" icon)?\n\n' +
          'Answer on line 1 with ONLY one of these keywords:\n' +
          '- IME_JAPANESE — IME is active and in Japanese (Hiragana/Katakana) input mode (\"あ\" shown)\n' +
          '- IME_ASCII    — IME is in ASCII/Half-width English mode (\"A\" shown) or IME is off\n' +
          '- IME_UNKNOWN  — Cannot clearly determine IME mode from the taskbar\n' +
          'Line 2+: one sentence describing what you see in the taskbar language/IME area.'
      } else {
        // action === 'status': classification keyword FIRST, then description.
        // Using the same pattern as action=lock ("Answer with ONLY one word")
        // prevents the Vision LLM from hallucinating elements in a free-form description.
        if (lang === 'ja') {
          prompt =
            'この画面を分析してください。\n\n' +
            '## 回答形式（必ずこの形式で回答）:\n' +
            '1行目: 分類キーワード1つだけ\n' +
            '2行目以降: 画面の説明2〜3文\n\n' +
            '## 分類キーワードの選択肢:\n' +
            '- LOCK_SCREEN — ロック画面（時刻/日付表示＋背景画像。入力欄なし）\n' +
            '- SIGN_IN_SCREEN — サインイン画面（ユーザーアバター＋PIN/パスワード入力欄が実際に見える）\n' +
            '- DESKTOP — デスクトップ（タスクバーが画面下部に見える）\n' +
            '- APPLICATION — アプリケーション画面\n' +
            '- BLACK_SCREEN — 真っ黒/信号なし\n\n' +
            '## 判定手順（この順番で判定すること）:\n' +
            '1. タスクバー（画面下部の横長バー、スタートボタン等）があるか？ → DESKTOP\n' +
            '2. 画面に大きく時刻（例: "12:34"）や日付が表示されているか？ → LOCK_SCREEN\n' +
            '3. ユーザーアバターの下にPIN/パスワード入力欄（白いテキストボックスまたはドット入力フィールド）が実際にはっきり見えるか？ → SIGN_IN_SCREEN\n' +
            '4. 上記のいずれにも該当しない → LOCK_SCREEN\n\n' +
            '## Windowsロック画面 vs サインイン画面の区別:\n' +
            '- ロック画面: 背景に写真や風景画像が表示され、画面中央〜下部に大きな時刻と日付が重ねて表示される。入力欄は一切ない。\n' +
            '- サインイン画面: ユーザーアバター（丸いアイコン）とユーザー名が中央に表示され、その下にPINまたはパスワードの入力欄がある。\n' +
            '- ロック画面では画面下部にユーザー名が小さく表示されることがあるが、これはサインイン画面ではない。\n' +
            '- 大きな時刻表示があれば必ずロック画面。時刻表示とPIN入力欄が同時に表示されることはない。\n\n' +
            '## 重要:\n' +
            '- 入力欄が見えなければ LOCK_SCREEN。入力欄を推測で追加しないこと。\n' +
            '- 実際に見えている要素だけを報告すること。\n' +
            '- 背景画像は写真・風景・抽象画像など様々。背景の種類で判断せず、時刻表示や入力欄の有無で判断すること。'
        } else {
          prompt =
            'Analyze this screen.\n\n' +
            '## Response format (you MUST follow this format):\n' +
            'Line 1: Classification keyword ONLY\n' +
            'Line 2+: 2-3 sentence description of the screen\n\n' +
            '## Classification keywords:\n' +
            '- LOCK_SCREEN — Lock screen (large time/date display over background image. No input field)\n' +
            '- SIGN_IN_SCREEN — Sign-in screen (user avatar AND a visible PIN/password input field)\n' +
            '- DESKTOP — Desktop (taskbar visible at bottom of screen)\n' +
            '- APPLICATION — Application window\n' +
            '- BLACK_SCREEN — Black/no signal\n\n' +
            '## Decision steps (follow this order):\n' +
            '1. Is there a taskbar (horizontal bar at screen bottom with Start button, etc.)? → DESKTOP\n' +
            '2. Is there a large time display (e.g. "12:34") and/or date shown prominently? → LOCK_SCREEN\n' +
            '3. Is there a user avatar with a PIN/password input field (white text box or dot field) clearly visible below it? → SIGN_IN_SCREEN\n' +
            '4. None of the above → LOCK_SCREEN\n\n' +
            '## Windows lock screen vs sign-in screen:\n' +
            '- Lock screen: Background photo/landscape image with large time and date overlaid. No input fields at all.\n' +
            '- Sign-in screen: User avatar (circular icon) and username centered, with PIN or password input field below.\n' +
            '- A small username at the bottom of a lock screen does NOT make it a sign-in screen.\n' +
            '- If a large time display is visible, it is ALWAYS a lock screen. Time display and PIN input never appear together.\n\n' +
            '## Critical:\n' +
            '- If no input field is visible → LOCK_SCREEN. Do NOT assume input fields exist.\n' +
            '- Only report elements that are ACTUALLY VISIBLE on screen.\n' +
            '- Background images can be photos, landscapes, or abstract images. Do NOT judge by background type — judge by presence of time display or input fields.' + langInstruction
        }
      }

      // Analyze with Vision LLM
      console.log('[API Server] Screen verify: calling Vision LLM...')
      const visionStart = Date.now()
      const analysis = await analyzeScreenWithVision(dataUrl, prompt, lang)
      console.log('[API Server] Screen verify: Vision LLM took ' + (Date.now() - visionStart) + 'ms')
      console.log('[API Server] Screen verify analysis:', analysis)

      // Parse result
      let status = 'UNKNOWN'
      let detail = analysis

      // Simple keyword detection from Vision LLM response
      // Action-specific parsing to avoid cross-contamination
      const upper = analysis.toUpperCase()

      // Helper: check if a keyword appears in a positive (non-negated) context
      const hasPositive = (keyword: string): boolean => {
        const idx = upper.indexOf(keyword)
        if (idx < 0) return false
        // Check for negation patterns immediately before the keyword
        const prefix = upper.substring(Math.max(0, idx - 20), idx)
        if (/\b(NO|NOT|WITHOUT|NO VISIBLE)\s*$/.test(prefix) ||
            /\bDOES NOT\b/.test(prefix) ||
            /\bNO VISIBLE[^.]*$/.test(prefix)) {
          return false
        }
        return true
      }

      // Normalize Japanese text for keyword matching (original + uppercased)
      const analysisLower = analysis.toLowerCase()

      if (action === 'status') {
        // ── Step 1: Try structured classification from first line ──
        // The prompt asks Vision LLM to output a classification keyword on the first line.
        // This is more reliable than keyword-matching in free-form descriptions,
        // which caused hallucination issues (e.g. "サインイン画面...PIN入力欄" on lock screens).
        const firstLine = analysis.split('\n')[0].trim().toUpperCase()
        const classificationLine = firstLine
          .replace(/^(分類|CLASSIFICATION)\s*[:：]\s*/i, '') // strip prefix if present
          .trim()

        // Extract description (everything after first line) for the detail field
        const descriptionLines = analysis.split('\n').slice(1).join('\n').trim()
        if (descriptionLines) {
          detail = descriptionLines
        }

        // Map classification keyword to status
        if (classificationLine.includes('BLACK') || classificationLine.includes('NO_SIGNAL')) {
          status = 'BLACK_SCREEN'
        } else if (classificationLine.includes('SIGN_IN') || classificationLine.includes('SIGN-IN') ||
            classificationLine.includes('LOGIN_SCREEN') || classificationLine.includes('LOGIN SCREEN')) {
          status = 'LOGIN_SCREEN'
        } else if (classificationLine.includes('LOCK')) {
          status = 'LOCK_SCREEN'
        } else if (classificationLine.includes('DESKTOP') || classificationLine.includes('APPLICATION')) {
          status = 'DESKTOP'
        }

        // ── Step 2: Fallback to keyword matching in full response ──
        // If structured classification didn't match, fall back to keyword detection.
        if (status === 'UNKNOWN') {
          console.log('[API Server] Screen verify: structured classification not found, falling back to keyword matching')
          if (upper.includes('BLACK SCREEN') || upper.includes('BLANK SCREEN') ||
              upper.includes('NO SIGNAL') || upper.includes('COMPLETELY BLACK') ||
              (upper.includes('NO VISIBLE') && upper.includes('BLACK')) ||
              analysisLower.includes('真っ黒') || analysisLower.includes('黒い画面') ||
              analysisLower.includes('信号なし') || analysisLower.includes('完全に黒') ||
              analysisLower.includes('真っ暗') || analysisLower.includes('ブラックスクリーン') ||
              analysisLower.includes('映像なし') || analysisLower.includes('no signal')) {
            status = 'BLACK_SCREEN'
          } else if (upper.includes('LOCK_SCREEN') || upper.includes('LOCK SCREEN') ||
              analysisLower.includes('ロック画面') || analysisLower.includes('ロックスクリーン')) {
            // LOCK_SCREEN before LOGIN — prioritize lock to avoid description hallucination
            status = 'LOCK_SCREEN'
          } else if (upper.includes('SIGN-IN SCREEN') || upper.includes('SIGN IN SCREEN') ||
              upper.includes('LOGIN_SCREEN') || upper.includes('LOGIN SCREEN') ||
              analysisLower.includes('サインイン画面')) {
            status = 'LOGIN_SCREEN'
          } else if (hasPositive('DESKTOP') || hasPositive('TASKBAR') ||
              hasPositive('DOCK') || hasPositive('MENU BAR') ||
              (analysisLower.includes('デスクトップ') && !analysisLower.includes('ではない')) ||
              (analysisLower.includes('タスクバー') && !analysisLower.includes('ではない')) ||
              (analysisLower.includes('dock') && !analysisLower.includes('ではない')) ||
              (analysisLower.includes('メニューバー') && !analysisLower.includes('ではない'))) {
            status = 'DESKTOP'
          } else if (upper.includes('LOGIN') || upper.includes('SIGN IN') || upper.includes('SIGN-IN') || upper.includes('PIN') ||
              analysisLower.includes('ログイン') || analysisLower.includes('サインイン') ||
              analysisLower.includes('pin入力') || analysisLower.includes('パスワード入力') ||
              analysisLower.includes('パスワードフィールド') || analysisLower.includes('touch id')) {
            status = 'LOGIN_SCREEN'
          } else if ((upper.includes('LOCK') && !upper.includes('NOT') && !upper.includes('DOES NOT')) ||
              (analysisLower.includes('ロック') && !analysisLower.includes('ではない'))) {
            status = 'LOCK_SCREEN'
          } else {
            status = 'DESCRIBED'
          }
        }
      } else if (action === 'lock') {
        // For lock verification: only detect LOCK_SCREEN or DESKTOP
        if (upper.includes('LOCK_SCREEN') || upper.includes('LOCK SCREEN') ||
            analysisLower.includes('ロック画面') || analysisLower.includes('ロックスクリーン')) {
          status = 'LOCK_SCREEN'
        } else if (upper.includes('LOCK') || upper.includes('CLOCK') || upper.includes('AVATAR') ||
            analysisLower.includes('ロック') || analysisLower.includes('時計') || analysisLower.includes('アバター')) {
          status = 'LOCK_SCREEN'
        } else if (hasPositive('DESKTOP') || hasPositive('TASKBAR') || hasPositive('ICON') ||
            (analysisLower.includes('デスクトップ') && !analysisLower.includes('ではない')) ||
            (analysisLower.includes('タスクバー') && !analysisLower.includes('ではない'))) {
          status = 'DESKTOP'
        }
      } else if (action === 'email_compose') {
        // For compose window verification
        const firstLine = analysis.split('\n')[0].trim().toUpperCase()
        if (firstLine.includes('COMPOSE_OPEN') && !firstLine.includes('NOT')) {
          status = 'COMPOSE_OPEN'
        } else if (firstLine.includes('COMPOSE_NOT_OPEN') || firstLine.includes('NOT_OPEN')) {
          status = 'COMPOSE_NOT_OPEN'
        } else if (upper.includes('COMPOSE_OPEN') && !upper.includes('COMPOSE_NOT_OPEN')) {
          status = 'COMPOSE_OPEN'
        } else {
          status = 'COMPOSE_NOT_OPEN'
        }
        const descLines = analysis.split('\n').slice(1).join('\n').trim()
        if (descLines) detail = descLines
      } else if (action === 'email_sent') {
        // For send completion verification
        const firstLine = analysis.split('\n')[0].trim().toUpperCase()
        if (firstLine.includes('SENT_SUCCESS')) {
          status = 'SENT_SUCCESS'
        } else if (firstLine.includes('SEND_ERROR')) {
          status = 'SEND_ERROR'
        } else if (firstLine.includes('COMPOSE_OPEN')) {
          status = 'COMPOSE_OPEN'
        } else if (upper.includes('SENT_SUCCESS')) {
          status = 'SENT_SUCCESS'
        } else if (upper.includes('SEND_ERROR') || (upper.includes('ERROR') && upper.includes('DIALOG'))) {
          status = 'SEND_ERROR'
        } else if (upper.includes('COMPOSE_OPEN') || upper.includes('COMPOSE WINDOW')) {
          status = 'COMPOSE_OPEN'
        } else {
          // Conservative: assume still open if uncertain
          status = 'COMPOSE_OPEN'
        }
        const descLines = analysis.split('\n').slice(1).join('\n').trim()
        if (descLines) detail = descLines
      } else if (action === 'email_outlook_active') {
        // For Outlook active window verification
        const firstLine = analysis.split('\n')[0].trim().toUpperCase()
        if (firstLine.includes('OUTLOOK_ACTIVE')) {
          status = 'OUTLOOK_ACTIVE'
        } else if (firstLine.includes('OUTLOOK_INACTIVE')) {
          status = 'OUTLOOK_INACTIVE'
        } else if (upper.includes('OUTLOOK_ACTIVE')) {
          status = 'OUTLOOK_ACTIVE'
        } else {
          status = 'OUTLOOK_INACTIVE' // conservative
        }
        const aDescLines = analysis.split('\n').slice(1).join('\n').trim()
        if (aDescLines) detail = aDescLines
      } else if (action === 'email_ime_mode') {
        // IME mode check
        const firstLine = analysis.split('\n')[0].trim().toUpperCase()
        if (firstLine.includes('IME_JAPANESE') || firstLine.includes('JAPANESE')) {
          status = 'IME_JAPANESE'
        } else if (firstLine.includes('IME_ASCII') || firstLine.includes('ASCII')) {
          status = 'IME_ASCII'
        } else if (upper.includes('IME_JAPANESE') || upper.includes('JAPANESE MODE') ||
            upper.includes('「あ」') || upper.includes('あ MODE') ||
            analysisLower.includes('日本語モード') || analysisLower.includes('ひらがな') ||
            analysisLower.includes('"あ"')) {
          status = 'IME_JAPANESE'
        } else if (upper.includes('IME_ASCII') || upper.includes('ASCII MODE') ||
            upper.includes('"A"') || upper.includes('ENGLISH MODE') ||
            analysisLower.includes('英数モード') || analysisLower.includes('半角英数')) {
          status = 'IME_ASCII'
        } else {
          status = 'IME_UNKNOWN' // cannot determine; caller should proceed cautiously
        }
        const imeDescLines = analysis.split('\n').slice(1).join('\n').trim()
        if (imeDescLines) detail = imeDescLines
      } else if (action === 'email_to_field' || action === 'email_subject_field' || action === 'email_body_field') {
        // For email field content verification
        const firstLine = analysis.split('\n')[0].trim().toUpperCase()
        if (firstLine.includes('FIELD_CORRECT')) {
          status = 'FIELD_CORRECT'
        } else if (firstLine.includes('FIELD_WRONG')) {
          status = 'FIELD_WRONG'
        } else if (firstLine.includes('FIELD_EMPTY')) {
          status = 'FIELD_EMPTY'
        } else if (upper.includes('FIELD_CORRECT')) {
          status = 'FIELD_CORRECT'
        } else if (upper.includes('FIELD_EMPTY')) {
          status = 'FIELD_EMPTY'
        } else {
          // Conservative: assume wrong if uncertain
          status = 'FIELD_WRONG'
        }
        const fieldDescLines = analysis.split('\n').slice(1).join('\n').trim()
        if (fieldDescLines) detail = fieldDescLines
      } else {
        // For login verification: detect LOGIN_SUCCESS, LOGIN_FAILED, or LOCK_SCREEN
        if (upper.includes('LOGIN_SUCCESS') || upper.includes('LOGIN SUCCESS') ||
            analysisLower.includes('ログイン成功')) {
          status = 'LOGIN_SUCCESS'
        } else if (upper.includes('LOGIN_FAILED') || upper.includes('LOGIN FAILED') || upper.includes('WRONG') || upper.includes('ERROR') || upper.includes('INCORRECT') ||
            analysisLower.includes('ログイン失敗') || analysisLower.includes('正しくありません') || analysisLower.includes('間違') || analysisLower.includes('エラー')) {
          status = 'LOGIN_FAILED'
        } else if (hasPositive('DESKTOP') || hasPositive('TASKBAR') ||
            (analysisLower.includes('デスクトップ') && !analysisLower.includes('ではない')) ||
            (analysisLower.includes('タスクバー') && !analysisLower.includes('ではない'))) {
          status = 'LOGIN_SUCCESS'
        } else if (upper.includes('LOCK_SCREEN') || upper.includes('LOCK SCREEN') || upper.includes('LOCK') ||
            analysisLower.includes('ロック画面') || analysisLower.includes('ロック')) {
          status = 'LOCK_SCREEN'
        }
      }

      // Also try JSON parse as fallback
      if (status === 'UNKNOWN') {
        try {
          const jsonMatch = analysis.match(/\{[^}]+\}/)
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0])
            if (parsed.status) {
              status = parsed.status
              detail = parsed.detail || analysis
            }
          }
        } catch {
          // ignore parse errors
        }
      }

      // If Vision LLM detected a black/sleep screen, try wake-up and re-analyze
      // This handles the case where the PC display turned off (power-saving)
      // but HDMI is still connected (frame passed brightness checks).
      if (status === 'BLACK_SCREEN' && this.mainWindow) {
        console.log('[API Server] Screen verify: Vision detected black/sleep screen, attempting wake + retry...')
        this.mainWindow.webContents.send('api:mouse:wake')
        await new Promise((r) => setTimeout(r, 4000))
        const retryCapture = await this.requestScreenCapture()
        if (retryCapture.dataUrl) {
          console.log('[API Server] Screen verify: wake succeeded, re-analyzing with Vision LLM...')
          const retryAnalysis = await analyzeScreenWithVision(retryCapture.dataUrl, prompt, lang)
          console.log('[API Server] Screen verify: retry analysis:', retryAnalysis)
          // Re-parse the retry analysis
          const retryUpper = retryAnalysis.toUpperCase()
          const retryLower = retryAnalysis.toLowerCase()
          const retryHasPositive = (keyword: string): boolean => {
            const idx = retryUpper.indexOf(keyword)
            if (idx < 0) return false
            const prefix = retryUpper.substring(Math.max(0, idx - 20), idx)
            return !(/\b(NO|NOT|WITHOUT|NO VISIBLE)\s*$/.test(prefix) || /\bDOES NOT\b/.test(prefix))
          }
          let retryStatus = 'BLACK_SCREEN'
          if (retryUpper.includes('SIGN-IN SCREEN') || retryUpper.includes('SIGN IN SCREEN') ||
              retryUpper.includes('LOGIN_SCREEN') || retryUpper.includes('LOGIN SCREEN') ||
              retryLower.includes('サインイン画面')) {
            retryStatus = 'LOGIN_SCREEN'
          } else if (retryUpper.includes('LOCK_SCREEN') || retryUpper.includes('LOCK SCREEN') ||
              retryLower.includes('ロック画面') || retryLower.includes('ロックスクリーン')) {
            retryStatus = 'LOCK_SCREEN'
          } else if (retryHasPositive('DESKTOP') || retryHasPositive('TASKBAR') ||
              retryHasPositive('DOCK') || retryHasPositive('MENU BAR') ||
              (retryLower.includes('デスクトップ') && !retryLower.includes('ではない')) ||
              (retryLower.includes('タスクバー') && !retryLower.includes('ではない')) ||
              (retryLower.includes('dock') && !retryLower.includes('ではない')) ||
              (retryLower.includes('メニューバー') && !retryLower.includes('ではない'))) {
            retryStatus = 'DESKTOP'
          } else if (retryUpper.includes('LOGIN') || retryUpper.includes('SIGN IN') || retryUpper.includes('SIGN-IN') ||
              retryLower.includes('ログイン') || retryLower.includes('サインイン') ||
              retryLower.includes('touch id')) {
            retryStatus = 'LOGIN_SCREEN'
          } else if ((retryUpper.includes('LOCK') && !retryUpper.includes('NOT')) ||
              (retryLower.includes('ロック') && !retryLower.includes('ではない'))) {
            retryStatus = 'LOCK_SCREEN'
          }
          if (retryStatus !== 'BLACK_SCREEN') {
            console.log(`[API Server] Screen verify: wake recovery succeeded: ${retryStatus}`)
            status = retryStatus
            detail = retryAnalysis
          } else {
            console.log('[API Server] Screen verify: still black after wake attempt')
            detail = retryAnalysis
          }
        } else {
          console.log('[API Server] Screen verify: wake retry capture still null')
        }
      }

      // Generate feedback
      let feedback = ''
      if (action === 'status') {
        switch (status) {
          case 'BLACK_SCREEN':
            feedback = `🖥️ 画面が消灯/スリープ状態の可能性があります。画面は黒く表示されていますが、HDMI接続は確認されています。スリープ復帰を試みましたが画面が変わりませんでした。PCの電源が入っていることを確認し、マウスやキーボードで復帰を試みてください。\n${detail}`
            break
          case 'NO_SIGNAL':
            feedback = `📹 映像信号がありません。PCの電源が入っていないか、HDMI接続が切れている可能性があります。\n${detail}`
            break
          case 'LOCK_SCREEN':
            feedback = `🔒 ロック画面です。\n${detail}`
            break
          case 'LOGIN_SCREEN':
            feedback = `🔑 サインイン画面です。\n${detail}`
            break
          case 'DESKTOP':
            feedback = `🖥️ デスクトップ画面です。\n${detail}`
            break
          default:
            feedback = `🔍 画面状態:\n${detail}`
        }
      } else if (action === 'lock') {
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
      } else if (action === 'email_compose') {
        switch (status) {
          case 'COMPOSE_OPEN':
            feedback = '✅ 新規メール作成画面が開いています。'
            if (detail) feedback += `\n${detail}`
            break
          case 'COMPOSE_NOT_OPEN':
            feedback = '⚠️ 新規メール作成画面が開いていません。'
            if (detail) feedback += `\n${detail}`
            break
          default:
            feedback = `🔍 画面状態: ${detail}`
        }
      } else if (action === 'email_sent') {
        switch (status) {
          case 'SENT_SUCCESS':
            feedback = '✅ メール送信完了が確認できました。'
            if (detail) feedback += `\n${detail}`
            break
          case 'SEND_ERROR':
            feedback = '❌ 送信エラーダイアログが検出されました。Outlookの画面を確認してください。'
            if (detail) feedback += `\n${detail}`
            break
          case 'COMPOSE_OPEN':
            feedback = '⚠️ コンポーズウィンドウが残っています。手動で送信を確認してください。'
            if (detail) feedback += `\n${detail}`
            break
          default:
            feedback = `🔍 画面状態: ${detail}`
        }
      } else if (action === 'email_outlook_active') {
        switch (status) {
          case 'OUTLOOK_ACTIVE':
            feedback = '✅ Outlookがアクティブウィンドウです。'
            if (detail) feedback += `\n${detail}`
            break
          case 'OUTLOOK_INACTIVE':
            feedback = '⚠️ Outlookが前面にありません。Alt+Tabでウィンドウを探します。'
            if (detail) feedback += `\n${detail}`
            break
          default:
            feedback = `🔍 画面状態: ${detail}`
        }
      } else if (action === 'email_to_field' || action === 'email_subject_field' || action === 'email_body_field') {
        const fieldName = action === 'email_to_field' ? '宛先(To)' : action === 'email_subject_field' ? '件名(Subject)' : '本文(Body)'
        switch (status) {
          case 'FIELD_CORRECT':
            feedback = `✅ ${fieldName}フィールドに正しい内容が入力されています。`
            if (detail) feedback += `\n${detail}`
            break
          case 'FIELD_WRONG':
            feedback = `⚠️ ${fieldName}フィールドの内容が期待値と異なります。`
            if (detail) feedback += `\n${detail}`
            break
          case 'FIELD_EMPTY':
            feedback = `❌ ${fieldName}フィールドが空です。入力されていない可能性があります。`
            if (detail) feedback += `\n${detail}`
            break
          default:
            feedback = `🔍 ${fieldName}フィールド状態: ${detail}`
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
            break
          case 'LOCK_SCREEN':
            feedback = '⚠️ ログイン未完了: まだサインイン画面が表示されています。'
            if (detail && detail !== analysis) feedback += `\n（${detail}）`
            break
          default:
            feedback = `🔍 画面状態: ${detail}`
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        success: true,
        visionConfigured: true,
        status,
        detail,
        feedback
      }))
    } catch (err) {
      console.error('[API Server] Screen verify error:', err)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: String(err) }))
    }
  }

  /**
   * POST /v1/actions — zeroclaw computer_use compatible endpoint.
   *
   * Accepts actions: key_type, key_press, screen_capture, mouse_move, mouse_click, mouse_drag.
   * Request format: { action, params?, policy?, metadata? }
   * Response format: { success, data?, error? }
   *
   * @see docs/multi-agent-spec.md Section 5.3, Section 12.1
   */
  private async handleComputerUseActions(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const body = await this.readBody(req)
      const request = JSON.parse(body) as {
        action: string
        params?: Record<string, unknown>
        policy?: Record<string, unknown>
        metadata?: Record<string, unknown>
      }

      if (!request.action) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: false, error: 'action is required' }))
        return
      }

      console.log(`[API Server] /v1/actions: action=${request.action}, params=${JSON.stringify(request.params || {})}`)

      switch (request.action) {
        case 'key_type': {
          const text = request.params?.text as string
          if (!text || typeof text !== 'string') {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, error: 'params.text is required for key_type' }))
            return
          }
          if (!this.mainWindow) {
            res.writeHead(503, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, error: 'Main window not available' }))
            return
          }
          console.log(`[API Server] /v1/actions key_type: sending ${text.length} chars`)
          this.mainWindow.webContents.send('api:keyboard:type', text)
          await new Promise((r) => setTimeout(r, text.length * 220 + 600))
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: true, data: {} }))
          return
        }

        case 'key_press': {
          const key = request.params?.key as string
          if (!key || typeof key !== 'string') {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, error: 'params.key is required for key_press' }))
            return
          }
          if (!this.mainWindow) {
            res.writeHead(503, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, error: 'Main window not available' }))
            return
          }
          // Normalize key string — split on "+" for combo keys
          const keys = this.normalizeKeys(key)
          console.log(`[API Server] /v1/actions key_press: keys=${JSON.stringify(keys)}`)
          this.mainWindow.webContents.send('api:keyboard:shortcut', keys)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: true, data: {} }))
          return
        }

        case 'screen_capture': {
          if (!this.mainWindow) {
            res.writeHead(503, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, error: 'Main window not available' }))
            return
          }
          const result = await this.requestScreenCapture()
          if (result.dataUrl) {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: true, data: { image: result.dataUrl } }))
          } else {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({
              success: false,
              error: `Screen capture failed: ${result.rejectReason || 'unknown'}`
            }))
          }
          return
        }

        case 'mouse_move': {
          const x = request.params?.x as number
          const y = request.params?.y as number
          if (x === undefined || y === undefined) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, error: 'params.x and params.y are required for mouse_move' }))
            return
          }
          if (!this.mainWindow) {
            res.writeHead(503, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, error: 'Main window not available' }))
            return
          }
          this.mainWindow.webContents.send('api:mouse:move', { x, y })
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: true, data: {} }))
          return
        }

        case 'mouse_click': {
          const cx = request.params?.x as number
          const cy = request.params?.y as number
          const button = (request.params?.button as string) || 'left'
          if (cx === undefined || cy === undefined) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, error: 'params.x and params.y are required for mouse_click' }))
            return
          }
          if (!this.mainWindow) {
            res.writeHead(503, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, error: 'Main window not available' }))
            return
          }
          this.mainWindow.webContents.send('api:mouse:click', { x: cx, y: cy, button })
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: true, data: {} }))
          return
        }

        case 'mouse_drag': {
          const fromX = request.params?.from_x as number
          const fromY = request.params?.from_y as number
          const toX = request.params?.to_x as number
          const toY = request.params?.to_y as number
          if (fromX === undefined || fromY === undefined || toX === undefined || toY === undefined) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({
              success: false,
              error: 'params.from_x, from_y, to_x, to_y are required for mouse_drag'
            }))
            return
          }
          if (!this.mainWindow) {
            res.writeHead(503, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, error: 'Main window not available' }))
            return
          }
          this.mainWindow.webContents.send('api:mouse:drag', { fromX, fromY, toX, toY })
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: true, data: {} }))
          return
        }

        /**
         * High-level NanoKVM actions — shared implementation for both picoclaw
         * (which has these as built-in Go tools) and zeroclaw (which calls them
         * via computer_use). The actual implementation lives here once.
         *
         * @see docs/multi-agent-spec.md Section 5 (HID 操作の統合)
         * @see docs/picoclaw-lock-login-spec.md
         */
        case 'nanokvm_lock': {
          // Win+L → wait 3s → screen verify
          if (!this.mainWindow) {
            res.writeHead(503, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, error: 'Main window not available' }))
            return
          }
          console.log('[API Server] /v1/actions nanokvm_lock: sending Win+L')
          const lockKeys = this.normalizeKeys('Win+L')
          this.mainWindow.webContents.send('api:keyboard:shortcut', lockKeys)
          await new Promise((r) => setTimeout(r, 3000))

          // Verify with Vision if configured
          let lockMessage = '✅ ロック操作を実行しました'
          let lockStatus = 'LOCK_SENT'
          if (isVisionConfigured()) {
            try {
              const lockCapture = await this.requestScreenCapture()
              if (lockCapture.dataUrl) {
                const lang = getVisionLanguage()
                const lockAnalysis = await analyzeScreenWithVision(lockCapture.dataUrl, VISION_PROMPT_LOCK, lang)
                console.log(`[API Server] nanokvm_lock Vision result: ${lockAnalysis.substring(0, 80)}`)
                const upper = lockAnalysis.toUpperCase()
                if (upper.includes('LOCK_SCREEN')) {
                  lockStatus = 'LOCK_SCREEN'
                  lockMessage = '✅ ロック完了: ロック画面が確認できました'
                } else if (upper.includes('DESKTOP')) {
                  lockStatus = 'DESKTOP'
                  lockMessage = '⚠️ ロック未完了: まだデスクトップが表示されています'
                }
              }
            } catch (visionErr) {
              console.warn('[API Server] nanokvm_lock Vision error (ignoring):', visionErr)
              // Vision error is non-fatal — Win+L was already sent
            }
          }
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: true, data: { status: lockStatus, message: lockMessage } }))
          return
        }

        case 'nanokvm_login': {
          // Perform full login sequence with vault support
          // params.password and params.username are optional when vault is configured
          const loginPassword = request.params?.password as string | undefined
          const loginUsername = request.params?.username as string | undefined
          console.log('[API Server] /v1/actions nanokvm_login: starting login sequence')
          const loginResult = await this.performLogin(loginPassword, loginUsername)
          if (!loginResult.success) {
            res.writeHead(loginResult.errorCode === 'vault_locked' ? 403 : 400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({
              success: false,
              error: loginResult.errorCode,
              message: loginResult.error,
              user_message: loginResult.userMessage,
              data: { status: loginResult.errorCode }
            }))
            return
          }
          // Optional: verify login result with Vision
          let loginMessage = '✅ ログイン操作を実行しました'
          let loginStatus = 'LOGIN_SENT'
          if (isVisionConfigured()) {
            try {
              await new Promise((r) => setTimeout(r, 3000)) // wait for desktop to render
              const loginCapture = await this.requestScreenCapture()
              if (loginCapture.dataUrl) {
                const lang = getVisionLanguage()
                const loginAnalysis = await analyzeScreenWithVision(loginCapture.dataUrl, VISION_PROMPT_LOGIN, lang)
                console.log(`[API Server] nanokvm_login Vision result: ${loginAnalysis.substring(0, 80)}`)
                const upper = loginAnalysis.toUpperCase()
                if (upper.includes('LOGIN_SUCCESS') || upper.includes('DESKTOP') || upper.includes('TASKBAR')) {
                  loginStatus = 'LOGIN_SUCCESS'
                  loginMessage = '✅ ログイン成功: デスクトップ画面が確認できました'
                } else if (upper.includes('LOGIN_FAILED') || upper.includes('WRONG') || upper.includes('INCORRECT')) {
                  loginStatus = 'LOGIN_FAILED'
                  loginMessage = '❌ ログイン失敗: PIN/パスワードが正しくないようです'
                } else if (upper.includes('LOCK_SCREEN') || upper.includes('SIGN_IN')) {
                  loginStatus = 'LOCK_SCREEN'
                  loginMessage = '⚠️ ログイン未完了: まだサインイン画面が表示されています'
                }
              }
            } catch (visionErr) {
              console.warn('[API Server] nanokvm_login Vision error (ignoring):', visionErr)
              // Vision error is non-fatal — login keys were already sent
            }
          }
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: true, data: { status: loginStatus, message: loginMessage } }))
          return
        }

        case 'nanokvm_send_email': {
          // Send email via Outlook (ASCII only)
          const emailTo = request.params?.to as string
          const emailSubject = request.params?.subject as string
          const emailBody = request.params?.body as string
          if (!emailTo || !emailSubject) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, error: 'params.to and params.subject are required for nanokvm_send_email' }))
            return
          }
          console.log(`[API Server] /v1/actions nanokvm_send_email: to=${emailTo}`)
          const emailResult = await this.performSendEmail(emailTo, emailSubject, emailBody || '')
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({
            success: emailResult.success,
            data: { status: emailResult.status, message: emailResult.message }
          }))
          return
        }

        default:
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, error: `Unknown action: ${request.action}` }))
          return
      }
    } catch (err) {
      console.error('[API Server] Error in /v1/actions:', err)
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: false, error: String(err) }))
    }
  }

  /**
   * Request screen capture from renderer process via IPC.
   * Falls back to ffmpeg native capture if the renderer IPC fails
   * (e.g. when macOS is locked or the display is off).
   */
  private async requestScreenCapture(): Promise<{ dataUrl: string | null; rejectReason?: string }> {
    // Step 1: Try renderer IPC capture (fast path — works when app is in foreground)
    const ipcResult = await this.requestScreenCaptureViaIpc()

    if (ipcResult.dataUrl) {
      return ipcResult
    }

    // Step 2: Renderer failed — try ffmpeg native capture as fallback
    // This works even when macOS is locked or display is off
    if (isFfmpegCaptureAvailable()) {
      console.log(`[API Server] Renderer capture failed (${ipcResult.rejectReason}), trying ffmpeg native capture...`)
      const nativeResult = await captureFrameNative()
      if (nativeResult.dataUrl) {
        console.log(`[API Server] ffmpeg native capture succeeded`)
        return nativeResult
      }
      console.warn(`[API Server] ffmpeg native capture also failed: ${nativeResult.rejectReason}`)
      // Return the native error since it's more specific
      return {
        dataUrl: null,
        rejectReason: `renderer: ${ipcResult.rejectReason}; ffmpeg: ${nativeResult.rejectReason}`
      }
    }

    // No fallback available
    return ipcResult
  }

  /**
   * Request screen capture from renderer process via IPC only.
   * Returns a Promise that resolves with the base64 data URL.
   */
  private requestScreenCaptureViaIpc(): Promise<{ dataUrl: string | null; rejectReason?: string }> {
    return new Promise((resolve) => {
      if (!this.mainWindow) {
        console.warn('[API Server] requestScreenCapture: no mainWindow')
        resolve({ dataUrl: null, rejectReason: 'no mainWindow' })
        return
      }

      const timeout = setTimeout(() => {
        ipcMain.removeAllListeners(IpcEvents.SCREEN_CAPTURE_RESULT)
        console.warn('[API Server] Screen capture timed out (5s)')
        resolve({ dataUrl: null, rejectReason: 'IPC timeout (5s)' })
      }, 5000)

      ipcMain.once(IpcEvents.SCREEN_CAPTURE_RESULT, (_event, dataUrl: string | null, rejectReason?: string) => {
        clearTimeout(timeout)
        if (rejectReason) {
          console.warn(`[API Server] Screen capture rejected by renderer: ${rejectReason}`)
        }
        console.log(`[API Server] Screen capture IPC result: ${dataUrl ? `data(${Math.round(dataUrl.length / 1024)}KB)` : 'null'}`)
        resolve({ dataUrl, rejectReason: rejectReason || undefined })
      })

      this.mainWindow.webContents.send(IpcEvents.SCREEN_CAPTURE)
    })
  }

  /**
   * POST /api/vault/unlock — unlock vault with master password (called by picoclaw agent)
   */
  private async handleVaultUnlock(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const body = await this.readBody(req)
      const { master_password } = JSON.parse(body)

      if (!master_password || typeof master_password !== 'string') {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'master_password is required' }))
        return
      }

      if (!vaultManager.isConfigured()) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'vault_not_configured', message: 'Vault is not set up' }))
        return
      }

      await vaultManager.unlock(master_password)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: true }))
    } catch (err) {
      console.error('[API Server] Vault unlock error:', err)
      res.writeHead(403, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'unlock_failed', message: String(err) }))
    }
  }

  /**
   * GET /api/vault/credential — get decrypted credential (only when unlocked)
   */
  private async handleVaultGetCredential(_req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!vaultManager.isUnlocked()) {
      res.writeHead(403, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'vault_locked', message: 'Vault is locked' }))
      return
    }

    const credential = vaultManager.getCredential()
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ success: true, credential }))
  }

  /**
   * GET /api/vault/status — check whether vault is configured and unlocked
   */
  private async handleVaultStatus(_req: IncomingMessage, res: ServerResponse): Promise<void> {
    const status = vaultManager.getStatus()
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ success: true, ...status }))
  }

  getUrl(): string {
    return `http://${this.config.host}:${this.config.port}`
  }
}
