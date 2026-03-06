import { ReactElement, useState, useRef, useEffect } from 'react'
import { MessageCircle, Send, X, Minimize2, Copy, Check, Clock, AlertTriangle } from 'lucide-react'
import { useAtom } from 'jotai'
import { useTranslation } from 'react-i18next'

import { IpcEvents } from '@common/ipc-events'
import { chatMessagesAtom, chatExpandedAtom, chatLoadingAtom, agentTypeAtom, ChatMessage } from '@renderer/jotai/chat'

interface RateLimitPopupData {
  waitSeconds: number
  waitTimeText: string
  limitType?: string
  limitValue?: number
  resetAt?: string
}

function RateLimitPopup({
  data,
  onClose
}: {
  data: RateLimitPopupData
  onClose: () => void
}): ReactElement {
  const [remaining, setRemaining] = useState(data.waitSeconds)

  useEffect(() => {
    if (remaining <= 0) return
    const timer = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [remaining])

  const formatCountdown = (sec: number): string => {
    if (sec <= 0) return '利用可能です！'
    const m = Math.floor(sec / 60)
    const s = sec % 60
    if (m > 0) return `${m}分${s.toString().padStart(2, '0')}秒`
    return `${s}秒`
  }

  const limitDesc = data.limitType === 'tokens' && data.limitValue
    ? `${data.limitValue.toLocaleString()} トークン/分`
    : data.limitType === 'requests' && data.limitValue
      ? `${data.limitValue.toLocaleString()} リクエスト/分`
      : 'レート制限'

  const resetTime = data.resetAt
    ? new Date(data.resetAt).toLocaleTimeString('ja-JP')
    : undefined

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-sm rounded-xl bg-neutral-800 p-6 shadow-2xl">
        {/* Header */}
        <div className="mb-4 flex items-center space-x-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/20">
            <AlertTriangle size={24} className="text-amber-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">APIレート制限に到達</h3>
            <p className="text-sm text-neutral-400">{limitDesc}</p>
          </div>
        </div>

        {/* Countdown */}
        <div className="mb-4 rounded-lg bg-neutral-900 p-4 text-center">
          <div className="mb-1 flex items-center justify-center space-x-2 text-neutral-400">
            <Clock size={16} />
            <span className="text-sm">復帰までの待ち時間</span>
          </div>
          <div className={`text-3xl font-mono font-bold ${remaining <= 0 ? 'text-green-400' : 'text-amber-400'}`}>
            {formatCountdown(remaining)}
          </div>
          {resetTime && remaining > 0 && (
            <p className="mt-1 text-xs text-neutral-500">
              復帰予定: {resetTime}
            </p>
          )}
        </div>

        {/* Tips */}
        <div className="mb-4 space-y-2 text-sm text-neutral-300">
          <p className="font-medium text-neutral-200">💡 節約のコツ:</p>
          <ul className="ml-4 list-disc space-y-1 text-neutral-400">
            <li>短いメッセージで指示する（例:「ロックして」）</li>
            <li>メッセージの間隔を空ける</li>
            <li>設定から別のプロバイダーに切り替える</li>
          </ul>
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className={`w-full rounded-lg px-4 py-2.5 font-medium transition-colors ${
            remaining <= 0
              ? 'bg-green-600 text-white hover:bg-green-700'
              : 'bg-neutral-700 text-neutral-300 hover:bg-neutral-600'
          }`}
        >
          {remaining <= 0 ? '✅ 再試行できます' : '閉じる'}
        </button>
      </div>
    </div>
  )
}

export const Chat = (): ReactElement => {
  const { t, i18n } = useTranslation()
  const [messages, setMessages] = useAtom(chatMessagesAtom)
  const [expanded, setExpanded] = useAtom(chatExpandedAtom)
  const [loading, setLoading] = useAtom(chatLoadingAtom)
  const [agentType] = useAtom(agentTypeAtom)
  const [input, setInput] = useState('')
  const [sessionId, setSessionId] = useState(() => `chat-${Date.now()}`)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [rateLimitPopup, setRateLimitPopup] = useState<RateLimitPopupData | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  /**
   * Check whether the last assistant message is requesting master password.
   * When true, the input field becomes a password field and the user's
   * message is masked to "🔐 ****" in chat history.
   */
  const isVaultPasswordMode = (() => {
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')
    return lastAssistant?.content?.includes('マスターパスワードを入力してください') ?? false
  })()

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleCopy(msg: ChatMessage): Promise<void> {
    try {
      // Try native clipboard API first
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(msg.content)
      } else {
        // Fallback: use temporary textarea
        const textarea = document.createElement('textarea')
        textarea.value = msg.content
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      }
      setCopiedId(msg.id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      // Last resort fallback
      try {
        const textarea = document.createElement('textarea')
        textarea.value = msg.content
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
        setCopiedId(msg.id)
        setTimeout(() => setCopiedId(null), 2000)
      } catch {
        console.error('[Chat] Failed to copy message')
      }
    }
  }

  async function handleSend(): Promise<void> {
    if (!input.trim() || loading) return

    // If in vault password mode, mask the displayed message
    const displayContent = isVaultPasswordMode ? '🔐 ****' : input.trim()

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: displayContent,
      timestamp: Date.now()
    }

    setMessages((prev) => [...prev, userMessage])
    const messageText = input.trim()
    setInput('')
    setLoading(true)

    try {
      // Get current language from i18n
      const currentLanguage = i18n.language || 'en'
      
      const result = await window.electron.ipcRenderer.invoke(
        IpcEvents.AGENT_SEND_MESSAGE, 
        messageText,
        currentLanguage,
        sessionId
      )
      
      if (result.success && result.response) {
        const assistantMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: result.response.trim(),
          timestamp: Date.now()
        }
        setMessages((prev) => [...prev, assistantMessage])
      } else {
        // Error message is already translated to Japanese by manager.ts
        const errorContent = result.error || 'Unknown error'

        // Show rate limit popup if rate limit info is available
        if (result.rateLimit) {
          setRateLimitPopup(result.rateLimit as RateLimitPopupData)
        }
        
        const errorMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: errorContent,
          timestamp: Date.now(),
          isError: true
        }
        setMessages((prev) => [...prev, errorMessage])
      }
    } catch (error) {
      console.error('[Chat] Error sending message:', error)
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `❌ エラーが発生しました\n\n${String(error)}`,
        timestamp: Date.now(),
        isError: true
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setLoading(false)
    }
  }

  function handleKeyPress(e: React.KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (!expanded) {
    return (
      <div
        className="fixed bottom-4 right-4 z-50 flex h-12 w-12 cursor-pointer items-center justify-center rounded-full bg-blue-600 text-white shadow-lg transition-all hover:bg-blue-700"
        onClick={() => setExpanded(true)}
      >
        <MessageCircle size={24} />
      </div>
    )
  }

  return (
    <div data-chat-area className="fixed bottom-4 right-4 z-50 flex h-[500px] w-[400px] flex-col rounded-lg bg-neutral-900 shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between rounded-t-lg bg-neutral-800 px-4 py-3">
        <div className="flex items-center space-x-2">
          <MessageCircle size={20} className="text-blue-500" />
          <span className="font-semibold text-white">
            {t('chat.title')} ({agentType})
          </span>
        </div>
        <div className="flex space-x-2">
          <button
            onClick={() => setExpanded(false)}
            className="rounded p-1 text-neutral-400 transition-colors hover:bg-neutral-700 hover:text-white"
          >
            <Minimize2 size={18} />
          </button>
          <button
            onClick={() => {
              setMessages([])
              setSessionId(`chat-${Date.now()}`)
            }}
            className="rounded p-1 text-neutral-400 transition-colors hover:bg-neutral-700 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center text-center text-neutral-500">
            {t('chat.empty')}
          </div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`group flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`relative max-w-[80%] rounded-lg px-3 py-2 select-text ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : msg.isError
                    ? 'bg-red-900/50 text-red-200 border border-red-700'
                    : 'bg-neutral-800 text-neutral-200'
              }`}
            >
              <div className="whitespace-pre-wrap break-words text-sm">{msg.content}</div>
              <div className="mt-1 flex items-center justify-between">
                <span
                  className={`text-xs ${
                    msg.role === 'user' 
                      ? 'text-blue-200' 
                      : msg.isError 
                        ? 'text-red-400' 
                        : 'text-neutral-500'
                  }`}
                >
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </span>
                <button
                  onClick={() => handleCopy(msg)}
                  className={`ml-2 rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 ${
                    copiedId === msg.id
                      ? 'text-green-400'
                      : msg.role === 'user'
                        ? 'text-blue-200 hover:text-white'
                        : 'text-neutral-500 hover:text-neutral-300'
                  }`}
                  title="コピー"
                >
                  {copiedId === msg.id ? <Check size={12} /> : <Copy size={12} />}
                </button>
              </div>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-lg bg-neutral-800 px-3 py-2 text-neutral-200">
              <div className="flex space-x-1">
                <div className="h-2 w-2 animate-bounce rounded-full bg-neutral-500"></div>
                <div
                  className="h-2 w-2 animate-bounce rounded-full bg-neutral-500"
                  style={{ animationDelay: '0.1s' }}
                ></div>
                <div
                  className="h-2 w-2 animate-bounce rounded-full bg-neutral-500"
                  style={{ animationDelay: '0.2s' }}
                ></div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-neutral-800 p-3">
        <div className="flex space-x-2">
          <input
            type={isVaultPasswordMode ? 'password' : 'text'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={isVaultPasswordMode ? '🔐 マスターパスワード' : t('chat.placeholder')}
            disabled={loading}
            className="flex-1 rounded-lg bg-neutral-800 px-3 py-2 text-sm text-white placeholder-neutral-500 outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className="flex items-center justify-center rounded-lg bg-blue-600 px-3 py-2 text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send size={18} />
          </button>
        </div>
      </div>

      {/* Rate Limit Popup */}
      {rateLimitPopup && (
        <RateLimitPopup
          data={rateLimitPopup}
          onClose={() => setRateLimitPopup(null)}
        />
      )}
    </div>
  )
}
