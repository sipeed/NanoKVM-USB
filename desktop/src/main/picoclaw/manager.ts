import { spawn, ChildProcess } from 'child_process'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import os from 'os'

export interface PicoclawConfig {
  agents?: {
    defaults?: {
      workspace?: string
      restrict_to_workspace?: boolean
      provider?: string
      model?: string
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

    this.process.stdout?.on('data', (data) => {
      console.log('[Picoclaw Output]', data.toString())
    })

    this.process.stderr?.on('data', (data) => {
      console.error('[Picoclaw Error]', data.toString())
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
          resolve(output)
        } else {
          reject(new Error(`Agent command failed: ${errorOutput}`))
        }
      })

      agent.on('error', (err) => {
        reject(err)
      })
    })
  }
}
