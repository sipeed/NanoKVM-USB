/**
 * Agent type definitions and common interfaces.
 * Shared between main process and renderer.
 *
 * @see docs/multi-agent-spec.md Section 2.2
 */

/** Supported AI agent types */
export type AgentType = 'picoclaw' | 'zeroclaw'

/** Default agent type */
export const DEFAULT_AGENT_TYPE: AgentType = 'picoclaw'
