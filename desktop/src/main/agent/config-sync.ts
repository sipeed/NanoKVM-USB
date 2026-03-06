/**
 * ConfigSyncService — manages ~/.nanoclaw/config.json (shared settings)
 * and syncs to per-agent config files.
 *
 * On startup:
 *   1. If ~/.nanoclaw/config.json exists, load it
 *   2. Otherwise, migrate from ~/.picoclaw/config.json (existing users)
 *   3. On every UI save, write both nanoclaw config and active agent config
 *
 * @see docs/multi-agent-spec.md Section 3
 */

import fs from 'fs'
import path from 'path'
import os from 'os'
import { CommonAgentConfig, DEFAULT_COMMON_CONFIG } from '@common/agent-config'
import { AgentType, DEFAULT_AGENT_TYPE } from '@common/agent-types'

/** Persisted format for ~/.nanoclaw/config.json */
interface NanoclawConfigFile {
  agent_type: AgentType
  agents?: {
    defaults?: {
      provider?: string
      model?: string
      model_name?: string
      vision_provider?: string
      vision_model?: string
      use_separate_vision_llm?: boolean
      temperature?: number
      max_tokens?: number
    }
  }
  providers?: Record<string, { api_key?: string; api_base?: string }>
  telegram?: {
    bot_token?: string
    user_id?: string
    enabled?: boolean
  }
  cached_models?: Record<string, string[]>
}

export class ConfigSyncService {
  private configPath: string
  private config: NanoclawConfigFile

  constructor() {
    this.configPath = path.join(os.homedir(), '.nanoclaw', 'config.json')
    this.config = { agent_type: DEFAULT_AGENT_TYPE }
  }

  /** Initialize — load or migrate config */
  initialize(): void {
    if (fs.existsSync(this.configPath)) {
      this.loadConfig()
    } else {
      this.migrateFromPicoclaw()
    }
    // On startup, sync to zeroclaw config if zeroclaw is the active agent
    if (this.config.agent_type === 'zeroclaw') {
      this.syncToZeroclaw()
    }
  }

  /** Get current config as CommonAgentConfig */
  getConfig(): CommonAgentConfig {
    const d = this.config.agents?.defaults
    const providers: Record<string, { apiKey: string; apiBase: string }> = {}
    if (this.config.providers) {
      for (const [key, val] of Object.entries(this.config.providers)) {
        providers[key] = {
          apiKey: val.api_key || '',
          apiBase: val.api_base || ''
        }
      }
    }

    return {
      agentType: this.config.agent_type || DEFAULT_AGENT_TYPE,
      provider: d?.provider || '',
      model: d?.model || '',
      modelName: d?.model_name || d?.model || '',
      providers,
      visionProvider: d?.vision_provider,
      visionModel: d?.vision_model,
      useSeparateVisionLlm: d?.use_separate_vision_llm,
      temperature: d?.temperature ?? 0.7,
      maxTokens: d?.max_tokens ?? 4096,
      telegram: this.config.telegram
        ? {
            botToken: this.config.telegram.bot_token || '',
            userId: this.config.telegram.user_id || '',
            enabled: this.config.telegram.enabled || false
          }
        : undefined,
      cachedModels: this.config.cached_models
    }
  }

  /** Update config from UI (partial merge) */
  updateConfig(updates: Partial<CommonAgentConfig>): void {
    // Merge agent type
    if (updates.agentType !== undefined) {
      this.config.agent_type = updates.agentType
    }

    // Merge defaults
    if (
      updates.provider !== undefined ||
      updates.model !== undefined ||
      updates.modelName !== undefined ||
      updates.visionProvider !== undefined ||
      updates.visionModel !== undefined ||
      updates.useSeparateVisionLlm !== undefined ||
      updates.temperature !== undefined ||
      updates.maxTokens !== undefined
    ) {
      if (!this.config.agents) this.config.agents = {}
      if (!this.config.agents.defaults) this.config.agents.defaults = {}
      const d = this.config.agents.defaults
      if (updates.provider !== undefined) d.provider = updates.provider
      if (updates.model !== undefined) d.model = updates.model
      if (updates.modelName !== undefined) d.model_name = updates.modelName
      if (updates.visionProvider !== undefined) d.vision_provider = updates.visionProvider
      if (updates.visionModel !== undefined) d.vision_model = updates.visionModel
      if (updates.useSeparateVisionLlm !== undefined)
        d.use_separate_vision_llm = updates.useSeparateVisionLlm
      if (updates.temperature !== undefined) d.temperature = updates.temperature
      if (updates.maxTokens !== undefined) d.max_tokens = updates.maxTokens
    }

    // Merge providers
    if (updates.providers) {
      if (!this.config.providers) this.config.providers = {}
      for (const [key, val] of Object.entries(updates.providers)) {
        this.config.providers[key] = {
          api_key: val.apiKey,
          api_base: val.apiBase
        }
      }
    }

    // Merge telegram
    if (updates.telegram) {
      this.config.telegram = {
        bot_token: updates.telegram.botToken,
        user_id: updates.telegram.userId,
        enabled: updates.telegram.enabled
      }
    }

    // Merge cachedModels
    if (updates.cachedModels) {
      this.config.cached_models = updates.cachedModels
    }

    this.saveConfig()
    // spec §3.3: agent_type == "zeroclaw" のとき config.toml へ同期
    if (this.config.agent_type === 'zeroclaw') {
      this.syncToZeroclaw()
    }
  }

  /** Get active agent type */
  getAgentType(): AgentType {
    return this.config.agent_type || DEFAULT_AGENT_TYPE
  }

  /** Set active agent type and save (spec §3.3: zeroclaw 切替時に config.toml へ同期) */
  setAgentType(type: AgentType): void {
    this.config.agent_type = type
    this.saveConfig()
    if (type === 'zeroclaw') {
      this.syncToZeroclaw()
    }
  }

  // ── Private methods ──

  /**
   * Patch ~/.zeroclaw/config.toml with current provider/model from shared config.
   * Only updates `default_provider` and `default_model` — all other zeroclaw
   * settings (security, autonomy, browser, etc.) are preserved unchanged.
   *
   * @see docs/multi-agent-spec.md §3.3
   */
  private syncToZeroclaw(): void {
    const provider = this.config.agents?.defaults?.provider
    const model = this.config.agents?.defaults?.model
    if (!provider && !model) return

    // Special case: github-copilot uses the GitHub Models API (OpenAI-compatible endpoint).
    // zeroclaw's built-in "github-copilot" provider requires a GitHub Copilot Chat subscription.
    // picoclaw uses api_base = "https://models.inference.ai.azure.com" (GitHub Models, free tier).
    // Map to zeroclaw's "custom:URL" format which works with any OpenAI-compatible endpoint.
    const isGitHubCopilot =
      provider === 'github-copilot' ||
      provider === 'github_copilot' ||
      provider === 'copilot'

    let zeroclawProvider: string | undefined = provider

    if (isGitHubCopilot) {
      const apiBase =
        this.config.providers?.['github-copilot']?.api_base ||
        this.config.providers?.['github_copilot']?.api_base ||
        'https://models.inference.ai.azure.com'
      zeroclawProvider = `custom:${apiBase}`
    }

    // Strip picoclaw-style "provider/" prefix from model name.
    // picoclaw stores "groq/llama-3.3-70b-versatile" but zeroclaw with provider=groq
    // expects bare "llama-3.3-70b-versatile".
    // Exception: OpenRouter model IDs like "anthropic/claude-sonnet-4.6" must NOT be
    // stripped because the sub-prefix is part of the OpenRouter model ID itself.
    let zeroclawModel = model
    if (zeroclawModel && provider) {
      // Strip using original provider name (before any custom: conversion)
      const prefix = provider + '/'
      if (zeroclawModel.startsWith(prefix)) {
        zeroclawModel = zeroclawModel.slice(prefix.length)
      }
    }

    const zeroclawConfigPath = path.join(os.homedir(), '.zeroclaw', 'config.toml')
    try {
      const configDir = path.dirname(zeroclawConfigPath)
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true })
      }

      let content = fs.existsSync(zeroclawConfigPath)
        ? fs.readFileSync(zeroclawConfigPath, 'utf-8')
        : ''

      if (zeroclawProvider) {
        if (/^default_provider\s*=/m.test(content)) {
          content = content.replace(
            /^default_provider\s*=\s*"[^"]*"/m,
            `default_provider = "${zeroclawProvider}"`
          )
        } else {
          content = `default_provider = "${zeroclawProvider}"\n` + content
        }
      }

      if (zeroclawModel) {
        if (/^default_model\s*=/m.test(content)) {
          content = content.replace(
            /^default_model\s*=\s*"[^"]*"/m,
            `default_model = "${zeroclawModel}"`
          )
        } else {
          content = `default_model = "${zeroclawModel}"\n` + content
        }
      }

      fs.writeFileSync(zeroclawConfigPath, content)
      console.log(`[ConfigSync] Synced to zeroclaw config: provider=${zeroclawProvider} model=${zeroclawModel}`)
    } catch (err) {
      console.error('[ConfigSync] Failed to sync to zeroclaw config:', err)
    }
  }

  /** Load nanoclaw config from disk */
  private loadConfig(): void {
    try {
      const content = fs.readFileSync(this.configPath, 'utf-8')
      this.config = JSON.parse(content)
      console.log('[ConfigSync] Loaded nanoclaw config')
    } catch (err) {
      console.error('[ConfigSync] Failed to load nanoclaw config:', err)
      this.config = { agent_type: DEFAULT_AGENT_TYPE }
    }
  }

  /** Persist nanoclaw config to disk */
  private saveConfig(): void {
    try {
      const configDir = path.dirname(this.configPath)
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true })
      }
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2))
      console.log('[ConfigSync] Saved nanoclaw config')
    } catch (err) {
      console.error('[ConfigSync] Failed to save nanoclaw config:', err)
    }
  }

  /**
   * Migrate from existing ~/.picoclaw/config.json.
   * First-time users updating from pre-multi-agent version.
   */
  private migrateFromPicoclaw(): void {
    const picoclawConfigPath = path.join(os.homedir(), '.picoclaw', 'config.json')
    if (!fs.existsSync(picoclawConfigPath)) {
      console.log('[ConfigSync] No picoclaw config to migrate, starting fresh')
      this.config = { agent_type: DEFAULT_AGENT_TYPE }
      this.saveConfig()
      return
    }

    try {
      const content = fs.readFileSync(picoclawConfigPath, 'utf-8')
      const picoclawConfig = JSON.parse(content)
      const defaults = picoclawConfig.agents?.defaults || {}

      this.config = {
        agent_type: 'picoclaw',
        agents: {
          defaults: {
            provider: defaults.provider,
            model: defaults.model,
            model_name: defaults.model_name || defaults.model,
            vision_provider: defaults.vision_provider,
            vision_model: defaults.vision_model,
            temperature: defaults.temperature,
            max_tokens: defaults.max_tokens
          }
        },
        providers: {}
      }

      // Copy provider configs
      if (picoclawConfig.providers) {
        for (const [key, val] of Object.entries(picoclawConfig.providers)) {
          const providerVal = val as { api_key?: string; api_base?: string }
          this.config.providers![key] = {
            api_key: providerVal.api_key,
            api_base: providerVal.api_base
          }
        }
      }

      // Copy Telegram settings
      const telegram = picoclawConfig.channels?.telegram
      if (telegram) {
        this.config.telegram = {
          bot_token: telegram.token || '',
          user_id: (telegram.allow_from && telegram.allow_from[0]) || '',
          enabled: telegram.enabled || false
        }
      }

      // Copy cached models
      if (picoclawConfig.model_update?.cached_models) {
        this.config.cached_models = picoclawConfig.model_update.cached_models
      }

      this.saveConfig()
      console.log('[ConfigSync] Migrated picoclaw config to nanoclaw')
    } catch (err) {
      console.error('[ConfigSync] Migration from picoclaw failed:', err)
      this.config = { agent_type: DEFAULT_AGENT_TYPE }
      this.saveConfig()
    }
  }
}
