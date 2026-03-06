/**
 * PicoclawAdapter — wraps existing PicoclawManager to implement AgentAdapter.
 *
 * This is a thin delegation layer. All picoclaw-specific logic remains in
 * PicoclawManager which continues to work unchanged for backward-compatible
 * PICOCLAW_* IPC events.
 *
 * @see docs/multi-agent-spec.md Section 10.1
 */

import { AgentAdapter, AgentConfigResult, AgentProvidersResult } from './adapter'
import { PicoclawManager } from '../picoclaw/manager'

export class PicoclawAdapter implements AgentAdapter {
  readonly type = 'picoclaw' as const
  private manager: PicoclawManager

  constructor(manager: PicoclawManager) {
    this.manager = manager
  }

  /** Expose the underlying manager for picoclaw-specific IPC handlers */
  getManager(): PicoclawManager {
    return this.manager
  }

  async sendMessage(message: string, language: string, sessionId?: string): Promise<string> {
    return this.manager.sendMessage(message, language, sessionId)
  }

  isVaultPendingUnlock(): boolean {
    return this.manager.getVaultPendingUnlock()
  }

  async getVersion(): Promise<string> {
    return this.manager.getVersion()
  }

  async getProviders(): Promise<AgentProvidersResult> {
    const data = await this.manager.getProviders()
    return data as AgentProvidersResult
  }

  getConfig(): AgentConfigResult {
    return this.manager.getConfig() as AgentConfigResult
  }

  updateConfig(config: Record<string, unknown>): void {
    this.manager.updateConfig(config)
  }

  async initialize(): Promise<void> {
    await this.manager.initialize()
  }

  async cleanup(): Promise<void> {
    await this.manager.stop()
  }
}
