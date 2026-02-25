import { spawn, ChildProcess } from 'child_process'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import os from 'os'
import http from 'http'
import { translateApiError, RateLimitInfo } from '@common/error-messages'

export interface ModelListEntry {
  model_name: string
  model: string
  api_key: string
  api_base: string
}

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
  model_list?: ModelListEntry[]
  channels?: Record<string, unknown>
  tools?: Record<string, unknown>
  gateway?: {
    host?: string
    port?: number
  }
  language?: string // User's preferred language (e.g., 'ja', 'en', 'zh')
  model_update?: {
    schedule?: {
      frequency?: 'daily' | 'weekly' | 'monthly'
      hour?: number
      dayOfWeek?: number
      dayOfMonth?: number
      enabled?: boolean
    }
    cached_models?: Record<string, string[]>
  }
}

export interface PicoclawStatus {
  running: boolean
  pid?: number
  version?: string
}

export class PicoclawManager {
  private process: ChildProcess | null = null
  private ghAuthProcess: ChildProcess | null = null
  private configPath: string
  private picoclawBinary: string
  private recentApiCalls: Map<string, number> = new Map() // endpoint+body → timestamp for dedup

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

    this.process.stdout?.on('data', async (data) => {
      const text = data.toString()
      console.log('[Picoclaw Output]', text)
      // Fallback: intercept tool call text for models that don't use structured function calling
      await this.interceptToolCallText(text)

      // Detect error messages and send Japanese follow-up to Telegram via stdin
      this.sendGatewayErrorFollowUp(text)
    })

    this.process.stderr?.on('data', (data) => {
      const text = data.toString()
      console.error('[Picoclaw Error]', text)
      // stderr is for Go process errors/logs only, NOT LLM output
      // Only translate errors for Telegram users, do NOT intercept tool calls
      this.sendGatewayErrorFollowUp(text)
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
   * Detect error patterns in gateway stdout and send a Japanese follow-up
   * message to Telegram via stdin. picoclaw sends the raw English error first;
   * this adds a user-friendly Japanese explanation as a follow-up message.
   *
   * If the Go side already formatted the error (detected by emoji markers),
   * skip the follow-up to avoid duplicate messages.
   */
  private sendGatewayErrorFollowUp(text: string): void {
    if (!this.process?.stdin?.writable) return

    // Skip if Go's formatUserFriendlyError already produced a user-friendly message
    // These emoji markers indicate the error was already formatted at the source
    if (text.includes('🚫') || text.includes('🔑') || text.includes('🌐')) {
      console.log('[Picoclaw] Error already formatted by Go, skipping follow-up')
      return
    }

    const { isError, message } = translateApiError(text)
    if (isError) {
      console.log('[Picoclaw] Sending Japanese error follow-up to gateway stdin')
      this.process.stdin.write(message + '\n')
    }
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
   * Get supported providers from picoclaw binary
   */
  async getProviders(): Promise<{
    providers: Array<{
      name: string
      label: string
      api_base: string
      key_url: string
      default_model: string
      auth_method: string
      models: string[]
    }>
  }> {
    return new Promise((resolve) => {
      try {
        const proc = spawn(this.picoclawBinary, ['providers'], { stdio: 'pipe' })
        let output = ''
        proc.stdout?.on('data', (data) => {
          output += data.toString()
        })
        proc.on('close', () => {
          try {
            const parsed = JSON.parse(output)
            resolve(parsed)
          } catch {
            console.error('[Picoclaw] Failed to parse providers JSON:', output)
            resolve({ providers: [] })
          }
        })
        proc.on('error', (err) => {
          console.error('[Picoclaw] Failed to run providers command:', err)
          resolve({ providers: [] })
        })
      } catch (err) {
        console.error('[Picoclaw] Failed to spawn providers command:', err)
        resolve({ providers: [] })
      }
    })
  }

  /**
   * Detect GitHub authentication via `gh auth token`.
   * Returns the GitHub token if authenticated, or null.
   *
   * In packaged Electron apps, PATH is limited to /usr/bin:/bin:/usr/sbin:/sbin.
   * We extend it with common installation directories so `gh` can be found.
   */
  detectGitHubToken(): { found: boolean; token: string | null; user: string | null } {
    const { execSync } = require('child_process')

    // Extend PATH for packaged app — gh may be in Homebrew, MacPorts, etc.
    const extraPaths = [
      '/usr/local/bin',
      '/opt/homebrew/bin',
      '/opt/local/bin',
      path.join(os.homedir(), '.local', 'bin'),
      path.join(os.homedir(), 'bin')
    ]
    const envPATH = [process.env.PATH, ...extraPaths].filter(Boolean).join(':')
    const execOpts = {
      encoding: 'utf-8' as const,
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'] as const,
      env: { ...process.env, PATH: envPATH }
    }

    try {
      const token = execSync('gh auth token', execOpts).trim()

      if (token) {
        // Get the username
        let user: string | null = null
        try {
          const status = execSync('gh auth status 2>&1', {
            ...execOpts,
            shell: true
          })
          const match = status.match(/Logged in to github\.com account (\S+)/)
          if (match) user = match[1]
        } catch {
          // ignore
        }

        console.log(`[Picoclaw] GitHub auth detected (user: ${user || 'unknown'})`)
        return { found: true, token, user }
      }
    } catch {
      // gh CLI not installed or not authenticated
    }

    console.log('[Picoclaw] GitHub auth not found (install gh CLI and run: gh auth login)')
    return { found: false, token: null, user: null }
  }

  /**
   * Check if gh CLI is installed and available.
   */
  isGhInstalled(): boolean {
    const { execSync } = require('child_process')
    const extraPaths = [
      '/usr/local/bin',
      '/opt/homebrew/bin',
      '/opt/local/bin',
      path.join(os.homedir(), '.local', 'bin'),
      path.join(os.homedir(), 'bin')
    ]
    const envPATH = [process.env.PATH, ...extraPaths].filter(Boolean).join(':')
    try {
      execSync('gh --version', {
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, PATH: envPATH }
      })
      return true
    } catch {
      return false
    }
  }

  /**
   * Find the full path to gh CLI binary.
   */
  private findGhPath(): string {
    const { execSync } = require('child_process')
    const extraPaths = [
      '/usr/local/bin',
      '/opt/homebrew/bin',
      '/opt/local/bin',
      path.join(os.homedir(), '.local', 'bin'),
      path.join(os.homedir(), 'bin')
    ]
    const envPATH = [process.env.PATH, ...extraPaths].filter(Boolean).join(':')
    try {
      return execSync('which gh', {
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, PATH: envPATH }
      }).trim()
    } catch {
      return 'gh' // fallback
    }
  }

  /**
   * Initiate GitHub authentication via `gh auth login --web`.
   *
   * Spawns `gh auth login -h github.com -p https -w` in the background,
   * parses the one-time device code from stderr, sends Enter to proceed,
   * and returns the code + verification URL.
   *
   * The caller should:
   * 1. Show the code to the user
   * 2. Open github.com/login/device in browser
   * 3. Poll detectGitHubToken() until auth completes
   */
  initiateGitHubAuth(): Promise<{
    code: string
    url: string
  }> {
    return new Promise((resolve, reject) => {
      if (this.ghAuthProcess) {
        try { this.ghAuthProcess.kill() } catch { /* ignore */ }
        this.ghAuthProcess = null
      }

      const ghPath = this.findGhPath()
      const extraPaths = [
        '/usr/local/bin',
        '/opt/homebrew/bin',
        '/opt/local/bin',
        path.join(os.homedir(), '.local', 'bin'),
        path.join(os.homedir(), 'bin')
      ]
      const envPATH = [process.env.PATH, ...extraPaths].filter(Boolean).join(':')

      console.log(`[Picoclaw] Starting gh auth login (${ghPath})`)

      const proc = spawn(ghPath, ['auth', 'login', '-h', 'github.com', '-p', 'https', '-w'], {
        env: { ...process.env, PATH: envPATH },
        stdio: ['pipe', 'pipe', 'pipe']
      })

      this.ghAuthProcess = proc
      let stderrData = ''
      let resolved = false

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true
          try { proc.kill() } catch { /* ignore */ }
          this.ghAuthProcess = null
          reject(new Error('gh auth login timed out (30s)'))
        }
      }, 30000)

      proc.stderr?.on('data', (data: Buffer) => {
        const chunk = data.toString()
        stderrData += chunk
        console.log(`[Picoclaw] gh auth stderr: ${chunk.trim()}`)

        // Look for one-time code: "First copy your one-time code: XXXX-XXXX"
        const match = stderrData.match(/one-time code:\s*([A-Z0-9]{4}-[A-Z0-9]{4})/i)
        if (match && !resolved) {
          resolved = true
          clearTimeout(timeout)
          const code = match[1]

          // Send Enter to skip "Press Enter to open github.com in your browser..."
          setTimeout(() => {
            try { proc.stdin?.write('\n') } catch { /* ignore */ }
          }, 500)

          resolve({ code, url: 'https://github.com/login/device' })
        }
      })

      proc.stdout?.on('data', (data: Buffer) => {
        console.log(`[Picoclaw] gh auth stdout: ${data.toString().trim()}`)
      })

      proc.on('error', (err) => {
        if (!resolved) {
          resolved = true
          clearTimeout(timeout)
          this.ghAuthProcess = null
          reject(new Error(`Failed to start gh auth login: ${err.message}`))
        }
      })

      proc.on('exit', (exitCode) => {
        this.ghAuthProcess = null
        console.log(`[Picoclaw] gh auth login exited with code ${exitCode}`)
        if (!resolved) {
          resolved = true
          clearTimeout(timeout)
          reject(new Error(`gh auth login exited unexpectedly (code: ${exitCode}). Output: ${stderrData}`))
        }
      })
    })
  }

  /**
   * Cancel an ongoing gh auth login process.
   */
  cancelGitHubAuth(): void {
    if (this.ghAuthProcess) {
      try { this.ghAuthProcess.kill() } catch { /* ignore */ }
      this.ghAuthProcess = null
      console.log('[Picoclaw] gh auth login cancelled')
    }
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

    // Sync model_list from agents.defaults + providers
    this.syncModelList(newConfig)

    // Ensure config directory exists
    const configDir = path.dirname(this.configPath)
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true })
    }

    fs.writeFileSync(this.configPath, JSON.stringify(newConfig, null, 2))
    console.log('[Picoclaw] Config updated')
  }

  /**
   * Sync model_list from agents.defaults and providers configuration.
   * The Go-side picoclaw requires model_list entries for GetModelConfig() lookups.
   * This ensures model_list stays in sync when provider/model settings change.
   */
  private syncModelList(config: PicoclawConfig): void {
    const defaults = config.agents?.defaults
    if (!defaults?.provider || !defaults?.model) return

    const providers = config.providers || {}
    const modelList: ModelListEntry[] = [...(config.model_list || [])]

    // Helper to upsert a model_list entry
    const upsertModel = (modelName: string, provider: string): void => {
      const providerConfig = providers[provider] || {}

      // If modelName already contains a provider prefix (e.g. "github-copilot/gpt-4o-mini"),
      // use it as-is for the model field instead of double-prefixing.
      const hasPrefix = modelName.includes('/')
      const canonicalProvider =
        provider === 'github_copilot' || provider === 'copilot'
          ? 'github-copilot'
          : provider
      const fullModel = hasPrefix ? modelName : `${canonicalProvider}/${modelName}`

      const entry: ModelListEntry = {
        model_name: modelName,
        model: fullModel,
        api_key: providerConfig.api_key || '',
        api_base: providerConfig.api_base || ''
      }

      // Normalize protocol prefix for GitHub Copilot
      if (
        !hasPrefix &&
        (provider === 'github-copilot' || provider === 'github_copilot' || provider === 'copilot')
      ) {
        entry.model = `github-copilot/${modelName}`
      }

      const existingIdx = modelList.findIndex((m) => m.model_name === modelName)
      if (existingIdx >= 0) {
        // Update existing entry with latest provider config
        modelList[existingIdx] = entry
      } else {
        modelList.push(entry)
      }
    }

    // Sync main model
    upsertModel(defaults.model, defaults.provider)

    // Sync vision model if it's different from main
    if (defaults.vision_provider && defaults.vision_model) {
      if (
        defaults.vision_model !== defaults.model ||
        defaults.vision_provider !== defaults.provider
      ) {
        upsertModel(defaults.vision_model, defaults.vision_provider)
      }
    }

    config.model_list = modelList
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

      agent.on('close', async (code) => {
        if (code === 0) {
          // Fallback: intercept tool call text for models that don't use structured function calling
          await this.interceptToolCallText(output)

          // Strip action tags from the response shown to user
          const cleanResponse = this.stripActionTags(output) || output

          resolve(cleanResponse)
        } else {
          // Translate error to Japanese before rejecting
          const translated = translateApiError(errorOutput)
          const err = new Error(translated.message) as Error & { rateLimit?: RateLimitInfo }
          if (translated.rateLimit) {
            err.rateLimit = translated.rateLimit
          }
          reject(err)
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
   * Must be awaited so that pendingVerification is set before callers check it.
   */
  private async interceptToolCallText(text: string): Promise<void> {
    let matched = false
    const promises: Promise<void>[] = []

    // Format 1: <<nanokvm:action:params>> tags
    const tagPattern = /<<nanokvm:(\w+):([^>]+)>>/g
    let tagMatch: RegExpExecArray | null
    while ((tagMatch = tagPattern.exec(text)) !== null) {
      const toolName = tagMatch[1]
      const paramStr = tagMatch[2]
      console.log(`[Picoclaw Interceptor] Detected action tag: <<nanokvm:${toolName}:${paramStr}>>`)
      const params = this.parseActionTagParams(toolName, paramStr)
      promises.push(this.executeToolCall(toolName, params))
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
        promises.push(this.executeToolCall(toolName, params))
        matched = true
      }
    }

    // Format 3: Python-like function call: nanokvm_login(password='mypin')
    if (!matched) {
      const funcPattern = /nanokvm_(\w+)\(([^)]+)\)/g
      let funcMatch: RegExpExecArray | null
      while ((funcMatch = funcPattern.exec(text)) !== null) {
        const toolName = funcMatch[1]
        const argsStr = funcMatch[2]
        console.log(`[Picoclaw Interceptor] Detected function call: nanokvm_${toolName}(${argsStr})`)
        try {
          const params = this.parseFunctionArgs(argsStr)
          promises.push(this.executeToolCall(toolName, params))
          matched = true
        } catch (err) {
          console.error(`[Picoclaw Interceptor] Failed to parse function args: ${argsStr}`, err)
        }
      }
    }

    // Wait for all tool calls to complete so pendingVerification is set
    if (promises.length > 0) {
      await Promise.all(promises)
    }

    if (!matched) {
      console.log('[Picoclaw Interceptor] No tool call patterns found in output')
    }
  }

  /**
   * Parse Python-like function arguments: password='mypin', keys=['Win','L']
   */
  private parseFunctionArgs(argsStr: string): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    // Match key=value pairs: password='mypin', keys=['Win','L'], username="admin"
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
   * e.g. "mypin" for login → {password: "mypin"}
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
   * Single execution path for all detected tool calls (fallback interceptor).
   * Only used when LLM outputs tool call text instead of using structured function calling.
   * Pre-check and post-verification are handled by Go-side NanoKVM tools via /api/screen/verify.
   */
  private async executeToolCall(toolName: string, params: Record<string, unknown>): Promise<void> {
    const API_BASE = 'http://127.0.0.1:18792'

    switch (toolName) {
      case 'shortcut': {
        const keys = this.normalizeKeysParam(params.keys)
        if (keys.length > 0) {
          this.callApi(`${API_BASE}/api/keyboard/shortcut`, { keys })
        }
        break
      }
      case 'login': {
        const password = String(params.password || '')
        const username = params.username && String(params.username) !== '' ? String(params.username) : undefined
        if (password) {
          const body: Record<string, string> = { password }
          if (username) body.username = username
          this.callApi(`${API_BASE}/api/keyboard/login`, body)
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
