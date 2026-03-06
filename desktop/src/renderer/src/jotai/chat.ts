import { atom } from 'jotai'
import { AgentType, DEFAULT_AGENT_TYPE } from '@common/agent-types'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  isError?: boolean
}

export const chatMessagesAtom = atom<ChatMessage[]>([])
export const chatExpandedAtom = atom<boolean>(false)
export const chatLoadingAtom = atom<boolean>(false)

/** Currently selected AI agent type */
export const agentTypeAtom = atom<AgentType>(DEFAULT_AGENT_TYPE)
