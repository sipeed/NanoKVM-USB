/**
 * AgentAdapter interface — the abstraction layer for AI agent backends.
 *
 * Each agent (picoclaw, zeroclaw) implements this interface.
 * The AgentRouter dispatches calls to the active adapter.
 *
 * NOTE: Gateway (Telegram) is NOT part of this interface.
 * TelegramService manages Bot API communication independently
 * and routes messages through AgentRouter.sendMessage().
 *
 * @see docs/multi-agent-spec.md Section 2.2
 */

import { AgentType } from '@common/agent-types'

/** Result from AgentRouter.sendMessage() — wraps the response with metadata */
export interface SendMessageResult {
  /** The agent's text response */
  response: string
  /**
   * Whether the user's message was treated as a vault master password
   * (LLM bypass). When true, callers like TelegramService should delete
   * the original message to avoid leaving the password in chat history.
   */
  wasVaultUnlock: boolean
}

export interface AgentAdapter {
  /** Agent type identifier */
  readonly type: AgentType

  /** Agent one-shot message send (shared by Chat UI and Telegram) */
  sendMessage(message: string, language: string, sessionId?: string): Promise<string>

  /**
   * Whether the adapter's vault_pending_unlock flag is currently true.
   * When true, the next sendMessage() call will treat the user's message
   * as a master password and bypass the LLM.
   * Used by AgentRouter to populate SendMessageResult.wasVaultUnlock.
   */
  isVaultPendingUnlock(): boolean

  /** Get agent version string */
  getVersion(): Promise<string>

  /** Get supported providers list */
  getProviders(): Promise<AgentProvidersResult>

  /** Read config (converted to common format) */
  getConfig(): AgentConfigResult

  /** Write config (common format → agent-specific format) */
  updateConfig(config: Record<string, unknown>): void

  /** Agent-specific initialization */
  initialize(): Promise<void>

  /** Agent-specific cleanup */
  cleanup(): Promise<void>
}

/** Result from getProviders() */
export interface AgentProvidersResult {
  providers: ProviderInfo[]
  [key: string]: unknown
}

export interface ProviderInfo {
  id: string
  name: string
  models?: string[]
  [key: string]: unknown
}

/** Result from getConfig() */
export interface AgentConfigResult {
  [key: string]: unknown
}
