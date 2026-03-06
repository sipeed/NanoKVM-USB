/**
 * CommonAgentConfig — shared settings type for all AI agent backends.
 *
 * This type is the UI's view of agent configuration. ConfigSyncService
 * translates between this common format and each agent's native format
 * (picoclaw JSON / zeroclaw TOML).
 *
 * @see docs/multi-agent-spec.md Section 2.3
 */

import { AgentType } from './agent-types'

/** Common agent configuration (UI-facing) */
export interface CommonAgentConfig {
  /** Active agent type */
  agentType: AgentType

  /** LLM provider (e.g. 'groq', 'openai', 'anthropic') */
  provider: string
  /** LLM model (e.g. 'groq/llama-3.1-8b-instant') */
  model: string
  /** Model display name */
  modelName: string
  /** Provider configurations (API keys, base URLs) */
  providers: Record<string, { apiKey: string; apiBase: string }>

  /** Vision provider */
  visionProvider?: string
  /** Vision model */
  visionModel?: string
  /** Use separate Vision LLM (only meaningful for zeroclaw) */
  useSeparateVisionLlm?: boolean

  /** Temperature */
  temperature: number
  /** Max tokens */
  maxTokens: number

  /** Telegram settings (managed by TelegramService, not per-agent) */
  telegram?: {
    botToken: string
    userId: string
    enabled: boolean
  }

  /** Cached model lists per provider (from ModelUpdater) */
  cachedModels?: Record<string, string[]>
}

/** Default common agent config */
export const DEFAULT_COMMON_CONFIG: CommonAgentConfig = {
  agentType: 'picoclaw',
  provider: '',
  model: '',
  modelName: '',
  providers: {},
  temperature: 0.7,
  maxTokens: 4096
}
