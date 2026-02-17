import { atom } from 'jotai'

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
