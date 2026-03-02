import { createServer, IncomingMessage, ServerResponse } from 'http'
import { BrowserWindow, ipcMain } from 'electron'
import { IpcEvents } from '@common/ipc-events'
import { isVisionConfigured, getVisionSetupMessage, analyzeScreenWithVision, getVisionLanguage } from '../picoclaw/vision'
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
    } else if (req.method === 'GET' && url.pathname === '/api/status') {
      await this.handleStatus(req, res)
    } else if (req.method === 'POST' && url.pathname === '/api/vault/unlock') {
      await this.handleVaultUnlock(req, res)
    } else if (req.method === 'GET' && url.pathname === '/api/vault/credential') {
      await this.handleVaultGetCredential(req, res)
    } else if (req.method === 'GET' && url.pathname === '/api/vault/status') {
      await this.handleVaultStatus(req, res)
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

      // Send to renderer process
      this.mainWindow.webContents.send('api:keyboard:type', text)

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

      // --- Vault integration ---
      // When vault is configured, ALWAYS use vault credentials regardless of
      // what password the agent provides. This prevents the LLM from needing
      // to know about @vault and ensures PINs never travel through chat channels.
      let password: string
      let username: string

      if (vaultManager.isConfigured()) {
        // Vault is configured — use vault credentials exclusively
        if (!vaultManager.isUnlocked()) {
          // Vault is locked — return vault_locked error.
          // The agent will ask the user for the master password in chat.
          // gateway (Telegram) / manager.ts (ChatUI) intercepts the next message
          // and sends it directly to the Vault API, bypassing the LLM.
          console.log('[API Server] Vault is configured but locked — returning vault_locked error')
          res.writeHead(403, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({
            error: 'vault_locked',
            message: 'マスターパスワードが必要です',
            user_message: '🔐 マスターパスワードを入力してください'
          }))
          return
        }

        const credential = vaultManager.getCredential()
        if (!credential || !credential.pin) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({
            error: 'vault_empty',
            message: 'No credential stored in vault'
          }))
          return
        }

        password = credential.pin
        username = credential.username || ''
        console.log('[API Server] Using vault credential for login (PIN masked, agent-provided password ignored)')
      } else {
        // Vault not configured: use password provided directly in the request
        if (typeof rawPassword !== 'string' || rawPassword === '') {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'password field is required' }))
          return
        }
        password = rawPassword
        username = typeof rawUsername === 'string' ? rawUsername.trim() : ''
      }

      // Sanitize username: reject OS names, bot names, emoji, and non-ASCII
      if (username && !ApiServer.isValidUsername(username)) {
        console.warn(`[API Server] Ignoring invalid username "${username}", using PIN-only mode`)
        username = ''
      }

      // Run login sequence in main process (Node.js timers are NOT frozen by macOS lock)
      // skipWake=true: picoclaw already confirmed LOCK_SCREEN via screen_check,
      // meaning the PC is awake — skip the 5s S3 wake delay.
      console.log('[API Server] Starting login sequence in main process (skipWake=true)...')
      await loginToWindows(password, username || undefined, true)
      console.log('[API Server] Login sequence completed')

      // Re-lock the vault after successful login.
      // Spec: "毎回マスターパスワードを要求 — セッション保持なし"
      // This ensures the next login attempt requires master password again.
      if (vaultManager.isConfigured() && vaultManager.isUnlocked()) {
        vaultManager.lock()
        console.log('[API Server] Vault re-locked after login (one-time use)')
      }

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: true }))
    } catch (err) {
      console.error('[API Server] Error in keyboard/login:', err)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: String(err) }))
    }
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
        'この画像はWindows PCの画面キャプチャです。以下の3つのうちどの状態か判定してください:\n\n' +
        '1. LOGIN_SUCCESS: デスクトップ画面が表示されている（タスクバー、アイコン等が見える）\n' +
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
      const { action } = JSON.parse(body) as { action: 'lock' | 'login' | 'status' }

      if (action !== 'lock' && action !== 'login' && action !== 'status') {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'action must be "lock", "login", or "status"' }))
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
        !!(reason?.includes('black/no-signal') || reason?.includes('solid-color/sleep'))
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
        prompt =
          'Is this a Windows lock screen or a desktop?\n' +
          'Lock screen: shows clock, date, user avatar, background image, no taskbar.\n' +
          'Desktop: shows taskbar at bottom, application windows, desktop icons.\n\n' +
          'Answer with ONLY one word: LOCK_SCREEN or DESKTOP' + langInstruction
      } else if (action === 'login') {
        prompt =
          'After a Windows login attempt, what is currently shown on screen?\n' +
          'Look carefully for these specific indicators:\n' +
          '- TASKBAR at the bottom of the screen (thin bar with icons) = LOGIN_SUCCESS\n' +
          '- Desktop icons, open windows, or Start menu = LOGIN_SUCCESS\n' +
          '- "PIN is incorrect" or "password is incorrect" error text = LOGIN_FAILED\n' +
          '- Large clock display, user avatar circle, or PIN input field = LOCK_SCREEN\n\n' +
          'IMPORTANT: If you see a taskbar at the bottom, it is LOGIN_SUCCESS even if the wallpaper looks similar to a lock screen.\n\n' +
          'Answer with ONLY one word: LOGIN_SUCCESS or LOGIN_FAILED or LOCK_SCREEN' + langInstruction
      } else {
        // action === 'status': general screen description
        prompt =
          'Describe what is currently shown on this computer screen in 2-3 sentences.\n' +
          'Include:\n' +
          '- What type of screen it is (desktop, lock screen, login screen, application window, etc.)\n' +
          '- What applications or windows are visible (if any)\n' +
          '- Any notable UI elements (taskbar, dialog boxes, error messages, etc.)\n\n' +
          'IMPORTANT classification rules:\n' +
          '- DESKTOP: Must have a TASKBAR visible at the bottom (or top/side). Without a taskbar, it is NOT a desktop.\n' +
          '- LOCK SCREEN: Shows a clock/time display, wallpaper background, but NO taskbar. May show user avatar.\n' +
          '- LOGIN SCREEN: Shows a user name/avatar with a PIN or password input field, but NO taskbar.\n' +
          '- If you see NO taskbar and NO applications, it is almost certainly a lock screen or login screen, NOT a desktop.\n\n' +
          'Be specific and factual about what you see.' + langInstruction
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
        // Detect black/blank screen FIRST (highest priority)
        // IMPORTANT: If we reach here, the frame PASSED brightness+variance checks,
        // meaning HDMI IS connected and producing frames. A "completely black" frame
        // indicates the PC display is OFF (power-saving/sleep), NOT that HDMI is
        // disconnected. Classify as BLACK_SCREEN (sleep), not NO_SIGNAL.
        // English AND Japanese keywords supported (Vision LLM may respond in either language)
        if (upper.includes('BLACK SCREEN') || upper.includes('BLANK SCREEN') ||
            upper.includes('NO SIGNAL') || upper.includes('COMPLETELY BLACK') ||
            (upper.includes('NO VISIBLE') && upper.includes('BLACK')) ||
            analysisLower.includes('真っ黒') || analysisLower.includes('黒い画面') ||
            analysisLower.includes('信号なし') || analysisLower.includes('完全に黒') ||
            analysisLower.includes('真っ暗') || analysisLower.includes('ブラックスクリーン') ||
            analysisLower.includes('映像なし') || analysisLower.includes('no signal')) {
          status = 'BLACK_SCREEN'
        } else if (upper.includes('LOCK_SCREEN') || upper.includes('LOCK SCREEN') ||
            analysisLower.includes('ロック画面') || analysisLower.includes('ロックスクリーン') ||
            analysisLower.includes('ログイン画面') && (analysisLower.includes('時計') || analysisLower.includes('アバター'))) {
          // LOCK_SCREEN before DESKTOP: Vision often says "lock screen...no taskbar"
          status = 'LOCK_SCREEN'
        } else if (hasPositive('DESKTOP') || hasPositive('TASKBAR') ||
            (analysisLower.includes('デスクトップ') && !analysisLower.includes('ではない')) ||
            (analysisLower.includes('タスクバー') && !analysisLower.includes('ではない'))) {
          // Only match DESKTOP/TASKBAR in positive (non-negated) context
          status = 'DESKTOP'
        } else if (upper.includes('LOGIN') || upper.includes('SIGN IN') || upper.includes('PIN') ||
            analysisLower.includes('ログイン') || analysisLower.includes('サインイン') ||
            analysisLower.includes('pin入力') || analysisLower.includes('パスワード入力')) {
          status = 'LOGIN_SCREEN'
        } else if ((upper.includes('LOCK') && !upper.includes('NOT') && !upper.includes('DOES NOT')) ||
            (analysisLower.includes('ロック') && !analysisLower.includes('ではない'))) {
          status = 'LOCK_SCREEN'
        } else {
          status = 'DESCRIBED'
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
          if (retryUpper.includes('LOCK_SCREEN') || retryUpper.includes('LOCK SCREEN') ||
              retryLower.includes('ロック画面') || retryLower.includes('ロックスクリーン') ||
              retryLower.includes('ログイン画面') && (retryLower.includes('時計') || retryLower.includes('アバター'))) {
            retryStatus = 'LOCK_SCREEN'
          } else if (retryHasPositive('DESKTOP') || retryHasPositive('TASKBAR') ||
              (retryLower.includes('デスクトップ') && !retryLower.includes('ではない')) ||
              (retryLower.includes('タスクバー') && !retryLower.includes('ではない'))) {
            retryStatus = 'DESKTOP'
          } else if (retryUpper.includes('LOGIN') || retryUpper.includes('SIGN IN') ||
              retryLower.includes('ログイン') || retryLower.includes('サインイン')) {
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
