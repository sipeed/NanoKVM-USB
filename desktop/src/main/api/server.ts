import { createServer, IncomingMessage, ServerResponse } from 'http'
import { BrowserWindow, ipcMain } from 'electron'
import { IpcEvents } from '@common/ipc-events'
import { isVisionConfigured, getVisionSetupMessage, analyzeScreenWithVision } from '../picoclaw/vision'

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
    } else if (req.method === 'GET' && url.pathname === '/api/status') {
      await this.handleStatus(req, res)
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

  private async handleKeyboardLogin(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const body = await this.readBody(req)
      const { password, username } = JSON.parse(body)

      if (typeof password !== 'string' || password === '') {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'password field is required' }))
        return
      }

      if (!this.mainWindow) {
        res.writeHead(503, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Main window not available' }))
        return
      }

      // Send to renderer process
      this.mainWindow.webContents.send('api:keyboard:login', { password, username })

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: true }))
    } catch (err) {
      console.error('[API Server] Error in keyboard/login:', err)
      res.writeHead(400, { 'Content-Type': 'application/json' })
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
      const dataUrl = await this.requestScreenCapture()
      if (dataUrl) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: true, image: dataUrl }))
      } else {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Failed to capture screen' }))
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
      const dataUrl = await this.requestScreenCapture()
      if (!dataUrl) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Failed to capture screen' }))
        return
      }

      // Analyze with Vision LLM
      const prompt = 
        'この画像はWindows PCの画面キャプチャです。以下の3つのうちどの状態か判定してください:\n\n' +
        '1. LOGIN_SUCCESS: デスクトップ画面が表示されている（タスクバー、アイコン等が見える）\n' +
        '2. LOGIN_FAILED: PIN/パスワードエラーメッセージが表示されている（「PIN が正しくありません」「パスワードが正しくありません」等）\n' +
        '3. LOCK_SCREEN: ロック画面またはサインイン画面が表示されている（時計、ユーザーアイコン、入力欄等）\n\n' +
        '回答は以下のJSON形式のみで返してください（他のテキストは不要）:\n' +
        '{"status": "LOGIN_SUCCESS" or "LOGIN_FAILED" or "LOCK_SCREEN", "detail": "判定理由を1文で"}'

      const analysis = await analyzeScreenWithVision(dataUrl, prompt)
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
   * Request screen capture from renderer process via IPC.
   * Returns a Promise that resolves with the base64 data URL.
   */
  private requestScreenCapture(): Promise<string | null> {
    return new Promise((resolve) => {
      if (!this.mainWindow) {
        resolve(null)
        return
      }

      const timeout = setTimeout(() => {
        ipcMain.removeAllListeners(IpcEvents.SCREEN_CAPTURE_RESULT)
        console.warn('[API Server] Screen capture timed out')
        resolve(null)
      }, 5000)

      ipcMain.once(IpcEvents.SCREEN_CAPTURE_RESULT, (_event, dataUrl: string | null) => {
        clearTimeout(timeout)
        resolve(dataUrl)
      })

      this.mainWindow.webContents.send(IpcEvents.SCREEN_CAPTURE)
    })
  }

  getUrl(): string {
    return `http://${this.config.host}:${this.config.port}`
  }
}
