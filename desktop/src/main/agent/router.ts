/**
 * AgentRouter — dispatches calls to the active AI agent adapter.
 *
 * This is the single processing path for all message sources (Chat UI and Telegram).
 * Both channels call AgentRouter.sendMessage() which delegates to the active adapter.
 *
 * @see docs/multi-agent-spec.md Section 7.2
 */

import { AgentType, DEFAULT_AGENT_TYPE } from '@common/agent-types'
import { AgentAdapter, AgentConfigResult, AgentProvidersResult, SendMessageResult } from './adapter'

export class AgentRouter {
  private activeType: AgentType = DEFAULT_AGENT_TYPE
  private adapters: Map<AgentType, AgentAdapter> = new Map()

  /** Register an adapter for a given agent type */
  register(adapter: AgentAdapter): void {
    this.adapters.set(adapter.type, adapter)
  }

  /** Get the currently active adapter */
  get active(): AgentAdapter {
    const adapter = this.adapters.get(this.activeType)
    if (!adapter) {
      throw new Error(`No adapter registered for agent type: ${this.activeType}`)
    }
    return adapter
  }

  /** Get current agent type */
  getType(): AgentType {
    return this.activeType
  }

  /** Switch active agent type */
  async setType(type: AgentType): Promise<void> {
    if (type === this.activeType) return

    if (!this.adapters.has(type)) {
      throw new Error(`No adapter registered for agent type: ${type}`)
    }

    // Cleanup current adapter
    await this.active.cleanup()

    this.activeType = type

    // Initialize new adapter
    await this.active.initialize()

    console.log(`[AgentRouter] Switched to ${type}`)
    // NOTE: TelegramService does not need restart — AgentRouter's target changed
  }

  /** Get version — delegates to active adapter */
  async getVersion(): Promise<string> {
    return this.active.getVersion()
  }

  /**
   * Send message — the single processing path for Chat UI and TelegramService.
   * Whichever channel calls this, the same AgentAdapter.sendMessage() is invoked.
   *
   * Returns SendMessageResult which includes metadata about whether the message
   * was treated as a vault master password (wasVaultUnlock). TelegramService uses
   * this to delete the password message from chat history.
   */
  async sendMessage(message: string, language: string, sessionId?: string): Promise<SendMessageResult> {
    // Check if the adapter is currently in vault_pending_unlock mode BEFORE calling.
    // If true, this message will be treated as a master password (LLM bypass).
    const wasVaultUnlock = this.active.isVaultPendingUnlock()
    const response = await this.active.sendMessage(message, language, sessionId)
    return { response, wasVaultUnlock }
  }

  /** Get providers — delegates to active adapter */
  async getProviders(): Promise<AgentProvidersResult> {
    return this.active.getProviders()
  }

  /** Get config — delegates to active adapter */
  getConfig(): AgentConfigResult {
    return this.active.getConfig()
  }

  /** Update config — delegates to active adapter */
  updateConfig(config: Record<string, unknown>): void {
    this.active.updateConfig(config)
  }
}
