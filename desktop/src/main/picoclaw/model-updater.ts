import https from 'https'
import http from 'http'
import fs from 'fs'
import path from 'path'
import os from 'os'
import type { PicoclawConfig } from './manager'

/**
 * Model Update Schedule configuration.
 * Stored in ~/.picoclaw/config.json under "model_update" key.
 */
export interface ModelUpdateSchedule {
  /** 'daily' | 'weekly' | 'monthly' */
  frequency: 'daily' | 'weekly' | 'monthly'
  /** Hour of day (0-23) */
  hour: number
  /** Day of week (0=Sunday, 1=Monday, ..., 6=Saturday). Used when frequency='weekly'. */
  dayOfWeek?: number
  /** Day of month (1-31). Used when frequency='monthly'. */
  dayOfMonth?: number
  /** Whether auto-update is enabled */
  enabled: boolean
}

export interface ModelUpdateStatus {
  /** ISO timestamp of last successful check */
  lastChecked?: string
  /** ISO timestamp of next scheduled check */
  nextCheck?: string
  /** Models that were updated in last check */
  lastUpdatedModels?: string[]
  /** Whether auto-switch occurred */
  autoSwitched?: boolean
  /** Auto-switch details */
  autoSwitchDetails?: string
}

export interface ProviderModels {
  provider: string
  models: Array<{
    id: string
    name?: string
    active?: boolean
    owned_by?: string
  }>
  fetchedAt: string
}

/** Default schedule: monthly on the 1st at 00:00 */
export const DEFAULT_SCHEDULE: ModelUpdateSchedule = {
  frequency: 'monthly',
  hour: 0,
  dayOfMonth: 1,
  enabled: true
}

/** Provider API endpoints for fetching model lists */
const PROVIDER_API_ENDPOINTS: Record<
  string,
  {
    url: string
    authHeader: (apiKey: string) => Record<string, string>
    parseModels: (data: unknown) => Array<{ id: string; name?: string; owned_by?: string }>
  }
> = {
  groq: {
    url: 'https://api.groq.com/openai/v1/models',
    authHeader: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
    parseModels: (data) => {
      const resp = data as { data?: Array<{ id: string; owned_by?: string }> }
      return (resp.data || []).map((m) => ({ id: m.id, name: m.id, owned_by: m.owned_by }))
    }
  },
  openai: {
    url: 'https://api.openai.com/v1/models',
    authHeader: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
    parseModels: (data) => {
      const resp = data as { data?: Array<{ id: string; owned_by?: string }> }
      return (resp.data || []).map((m) => ({ id: m.id, name: m.id, owned_by: m.owned_by }))
    }
  },
  openrouter: {
    url: 'https://openrouter.ai/api/v1/models',
    authHeader: () => ({}), // No auth needed for listing
    parseModels: (data) => {
      const resp = data as { data?: Array<{ id: string; name?: string }> }
      return (resp.data || []).map((m) => ({ id: m.id, name: m.name || m.id }))
    }
  },
  anthropic: {
    url: 'https://api.anthropic.com/v1/models',
    authHeader: (apiKey) => ({
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    }),
    parseModels: (data) => {
      const resp = data as { data?: Array<{ id: string; display_name?: string }> }
      return (resp.data || []).map((m) => ({ id: m.id, name: m.display_name || m.id }))
    }
  },
  deepseek: {
    url: 'https://api.deepseek.com/models',
    authHeader: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
    parseModels: (data) => {
      const resp = data as { data?: Array<{ id: string; owned_by?: string }> }
      return (resp.data || []).map((m) => ({ id: m.id, name: m.id, owned_by: m.owned_by }))
    }
  },
  ollama: {
    url: 'http://localhost:11434/api/tags',
    authHeader: () => ({}),
    parseModels: (data) => {
      const resp = data as { models?: Array<{ name: string; model: string }> }
      return (resp.models || []).map((m) => ({ id: m.name, name: m.name }))
    }
  },
  mistral: {
    url: 'https://api.mistral.ai/v1/models',
    authHeader: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
    parseModels: (data) => {
      const resp = data as { data?: Array<{ id: string; owned_by?: string }> }
      return (resp.data || []).map((m) => ({ id: m.id, name: m.id, owned_by: m.owned_by }))
    }
  }
}

/**
 * Recommended fallback models per provider.
 * Used when the currently configured model is no longer available.
 * Ordered by preference (first available wins).
 */
const RECOMMENDED_FALLBACKS: Record<string, string[]> = {
  groq: [
    'llama-3.1-8b-instant',
    'llama-3.3-70b-versatile',
    'mixtral-8x7b-32768',
    'gemma2-9b-it'
  ],
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-3.5-turbo'],
  openrouter: [
    'meta-llama/llama-3.1-8b-instruct',
    'google/gemini-2.0-flash-001',
    'google/gemini-pro-1.5'
  ],
  anthropic: [
    'claude-3-5-haiku-20241022',
    'claude-3-5-sonnet-20241022'
  ],
  deepseek: ['deepseek-chat', 'deepseek-coder'],
  ollama: ['llama3.2:1b', 'llama3.2:latest', 'qwen2.5:latest'],
  mistral: ['mistral-small-latest', 'mistral-medium-latest', 'mistral-large-latest']
}

/** Vision-capable model fallbacks */
const VISION_FALLBACKS: Record<string, string[]> = {
  groq: [
    'meta-llama/llama-4-scout-17b-16e-instruct',
    'meta-llama/llama-4-maverick-17b-128e-instruct',
    'llama-3.2-11b-vision-preview',
    'llama-3.2-90b-vision-preview'
  ],
  openai: ['gpt-4o-mini', 'gpt-4o'],
  openrouter: [
    'google/gemini-2.0-flash-001',
    'anthropic/claude-3.5-sonnet'
  ],
  anthropic: [
    'claude-3-5-haiku-20241022',
    'claude-3-5-sonnet-20241022'
  ],
  ollama: ['moondream2:latest', 'llava:latest']
}

export class ModelUpdater {
  private configPath: string
  private timer: ReturnType<typeof setTimeout> | null = null
  private statusPath: string

  constructor() {
    const pioclawHome = path.join(os.homedir(), '.picoclaw')
    this.configPath = path.join(pioclawHome, 'config.json')
    this.statusPath = path.join(pioclawHome, 'model-update-status.json')
  }

  /**
   * Initialize the scheduler. Call this on app startup.
   */
  initialize(): void {
    const schedule = this.getSchedule()
    if (schedule.enabled) {
      this.scheduleNext(schedule)
      console.log('[ModelUpdater] Scheduler initialized:', schedule)
    } else {
      console.log('[ModelUpdater] Auto-update disabled')
    }
  }

  /**
   * Stop the scheduler.
   */
  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  /**
   * Get current schedule configuration.
   */
  getSchedule(): ModelUpdateSchedule {
    try {
      const config = this.readConfig()
      const schedule = config.model_update?.schedule
      if (schedule) {
        return {
          frequency: schedule.frequency || DEFAULT_SCHEDULE.frequency,
          hour: schedule.hour ?? DEFAULT_SCHEDULE.hour,
          dayOfWeek: schedule.dayOfWeek,
          dayOfMonth: schedule.dayOfMonth ?? DEFAULT_SCHEDULE.dayOfMonth,
          enabled: schedule.enabled ?? DEFAULT_SCHEDULE.enabled
        }
      }
    } catch {
      // ignore
    }
    return { ...DEFAULT_SCHEDULE }
  }

  /**
   * Update schedule configuration and restart the scheduler.
   */
  setSchedule(schedule: ModelUpdateSchedule): void {
    const config = this.readConfig()
    if (!config.model_update) {
      config.model_update = {}
    }
    config.model_update.schedule = schedule
    this.writeConfig(config)

    // Restart scheduler
    this.stop()
    if (schedule.enabled) {
      this.scheduleNext(schedule)
    }
    console.log('[ModelUpdater] Schedule updated:', schedule)
  }

  /**
   * Get update status (last checked, next check, etc.)
   */
  getStatus(): ModelUpdateStatus {
    try {
      if (fs.existsSync(this.statusPath)) {
        const content = fs.readFileSync(this.statusPath, 'utf-8')
        return JSON.parse(content)
      }
    } catch {
      // ignore
    }
    return {}
  }

  /**
   * Manually trigger a model list update for all configured providers.
   * Returns the update result.
   */
  async updateNow(): Promise<{
    success: boolean
    providers: Array<{
      provider: string
      modelCount: number
      error?: string
    }>
    autoSwitched: boolean
    autoSwitchDetails?: string
  }> {
    console.log('[ModelUpdater] Starting model list update...')
    const config = this.readConfig()
    const results: Array<{ provider: string; modelCount: number; error?: string }> = []

    // Determine which providers to check
    const chatProvider = config.agents?.defaults?.provider
    const visionProvider = config.agents?.defaults?.vision_provider
    const providersToCheck = new Set<string>()
    if (chatProvider) providersToCheck.add(chatProvider)
    if (visionProvider) providersToCheck.add(visionProvider)

    // If no providers configured, check all that have API keys
    if (providersToCheck.size === 0) {
      for (const [provider] of Object.entries(config.providers || {})) {
        if (PROVIDER_API_ENDPOINTS[provider]) {
          providersToCheck.add(provider)
        }
      }
    }

    // Fetch models for each provider
    const fetchedModels: Record<string, string[]> = {}
    for (const provider of providersToCheck) {
      try {
        const apiKey = config.providers?.[provider]?.api_key || ''
        const models = await this.fetchModels(provider, apiKey)
        fetchedModels[provider] = models.map((m) => m.id)
        results.push({ provider, modelCount: models.length })
        console.log(`[ModelUpdater] ${provider}: ${models.length} models available`)
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err)
        results.push({ provider, modelCount: 0, error })
        console.error(`[ModelUpdater] Failed to fetch ${provider} models:`, error)
      }
    }

    // Check if currently configured models are still available
    let autoSwitched = false
    let autoSwitchDetails: string | undefined

    // Check chat model
    if (chatProvider && fetchedModels[chatProvider]) {
      const currentModel = config.agents?.defaults?.model || ''
      const availableModels = fetchedModels[chatProvider]
      if (currentModel && availableModels.length > 0 && !availableModels.includes(currentModel)) {
        const newModel = this.findBestFallback(chatProvider, availableModels, false)
        if (newModel) {
          console.log(
            `[ModelUpdater] Chat model "${currentModel}" no longer available. Switching to "${newModel}"`
          )
          if (!config.agents) config.agents = {}
          if (!config.agents.defaults) config.agents.defaults = {}
          config.agents.defaults.model = newModel
          autoSwitched = true
          autoSwitchDetails = `チャットモデル: ${currentModel} → ${newModel}`
        }
      }
    }

    // Check vision model
    if (visionProvider && fetchedModels[visionProvider]) {
      const currentVisionModel = config.agents?.defaults?.vision_model || ''
      const availableModels = fetchedModels[visionProvider]
      if (
        currentVisionModel &&
        availableModels.length > 0 &&
        !availableModels.includes(currentVisionModel)
      ) {
        const newModel = this.findBestFallback(visionProvider, availableModels, true)
        if (newModel) {
          console.log(
            `[ModelUpdater] Vision model "${currentVisionModel}" no longer available. Switching to "${newModel}"`
          )
          if (!config.agents) config.agents = {}
          if (!config.agents.defaults) config.agents.defaults = {}
          config.agents.defaults.vision_model = newModel
          autoSwitched = true
          const detail = `Visionモデル: ${currentVisionModel} → ${newModel}`
          autoSwitchDetails = autoSwitchDetails
            ? `${autoSwitchDetails}\n${detail}`
            : detail
        }
      }
    }

    // Save config if auto-switched
    if (autoSwitched) {
      this.writeConfig(config)
    }

    // Save cached model lists
    if (!config.model_update) config.model_update = {}
    config.model_update.cached_models = fetchedModels
    this.writeConfig(config)

    // Update status
    const status: ModelUpdateStatus = {
      lastChecked: new Date().toISOString(),
      nextCheck: this.calculateNextCheck(this.getSchedule())?.toISOString(),
      lastUpdatedModels: Object.entries(fetchedModels).map(
        ([p, m]) => `${p}: ${m.length} models`
      ),
      autoSwitched,
      autoSwitchDetails
    }
    this.saveStatus(status)

    console.log('[ModelUpdater] Update complete. Auto-switched:', autoSwitched)
    return { success: true, providers: results, autoSwitched, autoSwitchDetails }
  }

  /**
   * Get cached available models for a specific provider.
   */
  getCachedModels(provider: string): string[] {
    try {
      const config = this.readConfig()
      return config.model_update?.cached_models?.[provider] || []
    } catch {
      return []
    }
  }

  // --- Private helpers ---

  private readConfig(): PicoclawConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        const content = fs.readFileSync(this.configPath, 'utf-8')
        return JSON.parse(content) as PicoclawConfig
      }
    } catch {
      // ignore
    }
    return {}
  }

  private writeConfig(config: PicoclawConfig): void {
    const configDir = path.dirname(this.configPath)
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true })
    }
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2))
  }

  private saveStatus(status: ModelUpdateStatus): void {
    try {
      const dir = path.dirname(this.statusPath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      fs.writeFileSync(this.statusPath, JSON.stringify(status, null, 2))
    } catch (err) {
      console.error('[ModelUpdater] Failed to save status:', err)
    }
  }

  /**
   * Fetch available models from a provider's API.
   */
  private fetchModels(
    provider: string,
    apiKey: string
  ): Promise<Array<{ id: string; name?: string; owned_by?: string }>> {
    const endpoint = PROVIDER_API_ENDPOINTS[provider]
    if (!endpoint) {
      return Promise.reject(new Error(`Unknown provider: ${provider}`))
    }

    return new Promise((resolve, reject) => {
      const url = new URL(endpoint.url)
      const isHttps = url.protocol === 'https:'
      const lib = isHttps ? https : http
      const headers = {
        ...endpoint.authHeader(apiKey),
        Accept: 'application/json'
      }

      const req = lib.request(
        {
          hostname: url.hostname,
          port: url.port || (isHttps ? 443 : undefined),
          path: url.pathname,
          method: 'GET',
          headers
        },
        (res) => {
          let body = ''
          res.on('data', (chunk) => {
            body += chunk.toString()
          })
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              try {
                const data = JSON.parse(body)
                const models = endpoint.parseModels(data)
                resolve(models)
              } catch (err) {
                reject(new Error(`Failed to parse ${provider} response: ${err}`))
              }
            } else {
              reject(new Error(`${provider} API returned ${res.statusCode}: ${body.substring(0, 200)}`))
            }
          })
        }
      )

      req.on('error', (err) => reject(err))
      req.setTimeout(30000, () => {
        req.destroy()
        reject(new Error(`${provider} API request timed out`))
      })
      req.end()
    })
  }

  /**
   * Find the best fallback model from the available list.
   */
  private findBestFallback(
    provider: string,
    availableModels: string[],
    isVision: boolean
  ): string | null {
    const fallbacks = isVision
      ? VISION_FALLBACKS[provider] || []
      : RECOMMENDED_FALLBACKS[provider] || []

    // Try preferred fallbacks first
    for (const fallback of fallbacks) {
      if (availableModels.includes(fallback)) {
        return fallback
      }
    }

    // If no preferred fallback found, use the first available model
    return availableModels.length > 0 ? availableModels[0] : null
  }

  /**
   * Calculate the next check time based on schedule.
   */
  private calculateNextCheck(schedule: ModelUpdateSchedule): Date | null {
    if (!schedule.enabled) return null

    const now = new Date()
    const next = new Date(now)
    next.setMinutes(0, 0, 0)
    next.setHours(schedule.hour)

    switch (schedule.frequency) {
      case 'daily':
        // Next occurrence of the specified hour
        if (next <= now) {
          next.setDate(next.getDate() + 1)
        }
        break

      case 'weekly': {
        const targetDay = schedule.dayOfWeek ?? 1 // Default Monday
        const currentDay = now.getDay()
        let daysUntil = targetDay - currentDay
        if (daysUntil < 0 || (daysUntil === 0 && next <= now)) {
          daysUntil += 7
        }
        next.setDate(next.getDate() + daysUntil)
        break
      }

      case 'monthly': {
        const targetDate = schedule.dayOfMonth ?? 1
        next.setDate(targetDate)
        if (next <= now) {
          next.setMonth(next.getMonth() + 1)
        }
        // Handle months with fewer days (e.g., Feb 30 → Mar 1 is OK)
        break
      }
    }

    return next
  }

  /**
   * Schedule the next model list update.
   */
  private scheduleNext(schedule: ModelUpdateSchedule): void {
    const nextCheck = this.calculateNextCheck(schedule)
    if (!nextCheck) return

    const delay = nextCheck.getTime() - Date.now()
    if (delay <= 0) {
      // Should run now
      this.runScheduledUpdate()
      return
    }

    // Cap delay at 24 hours to avoid overflow and ensure we re-check regularly
    const cappedDelay = Math.min(delay, 24 * 60 * 60 * 1000)

    console.log(
      `[ModelUpdater] Next check at ${nextCheck.toISOString()} (in ${Math.round(cappedDelay / 60000)} min)`
    )

    this.timer = setTimeout(() => {
      if (cappedDelay < delay) {
        // Re-schedule: we capped the delay, so check again
        this.scheduleNext(schedule)
      } else {
        this.runScheduledUpdate()
      }
    }, cappedDelay)
  }

  /**
   * Run the scheduled update and re-schedule the next one.
   */
  private async runScheduledUpdate(): Promise<void> {
    try {
      console.log('[ModelUpdater] Running scheduled update...')
      await this.updateNow()
    } catch (err) {
      console.error('[ModelUpdater] Scheduled update failed:', err)
    }

    // Re-schedule
    const schedule = this.getSchedule()
    if (schedule.enabled) {
      this.scheduleNext(schedule)
    }
  }
}
