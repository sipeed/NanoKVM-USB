import { ReactElement, useState, useRef, useEffect } from 'react'
import { MessageCircle, Send, X, Minimize2 } from 'lucide-react'
import { useAtom } from 'jotai'
import { useTranslation } from 'react-i18next'

import { IpcEvents } from '@common/ipc-events'
import { chatMessagesAtom, chatExpandedAtom, chatLoadingAtom, ChatMessage } from '@renderer/jotai/chat'

export const Chat = (): ReactElement => {
  const { t, i18n } = useTranslation()
  const [messages, setMessages] = useAtom(chatMessagesAtom)
  const [expanded, setExpanded] = useAtom(chatExpandedAtom)
  const [loading, setLoading] = useAtom(chatLoadingAtom)
  const [input, setInput] = useState('')
  const [sessionId, setSessionId] = useState(() => `chat-${Date.now()}`)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend(): Promise<void> {
    if (!input.trim() || loading) return

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
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
        IpcEvents.PICOCLAW_SEND_MESSAGE, 
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
        // Parse error message for better UX
        let errorContent = result.error || 'Unknown error'
        
        // Check for rate limit errors
        if (errorContent.includes('Rate limit') || errorContent.includes('rate limit')) {
          if (errorContent.includes('Wait')) {
            const waitMatch = errorContent.match(/Wait\s+(\d+)([msh])/i)
            if (waitMatch) {
              const waitTime = waitMatch[1]
              const unit = waitMatch[2] === 'h' ? '時間' : waitMatch[2] === 'm' ? '分' : '秒'
              errorContent = `🚫 レート制限に達しました\n\n無料枠を使い切りました。${waitTime}${unit}後に再試行してください。\n\nまたは、設定から別のLLMプロバイダー(OpenRouter, Ollamaなど)に切り替えることができます。`
            } else {
              errorContent = `🚫 レート制限に達しました\n\n無料枠を使い切りました。しばらく待ってから再試行してください。\n\nまたは、設定から別のLLMプロバイダーに切り替えることができます。`
            }
          } else {
            errorContent = `🚫 レート制限エラー\n\n無料枠を使い切った可能性があります。\n\n設定から別のLLMプロバイダーに切り替えるか、しばらく待ってから再試行してください。`
          }
        }
        // Check for API key errors
        else if (errorContent.includes('API key') || errorContent.includes('api_key') || errorContent.includes('Authorization')) {
          errorContent = `🔑 認証エラー\n\nAPIキーが設定されていないか、無効です。\n\n設定からAPIキーを確認してください。`
        }
        // Check for network errors
        else if (errorContent.includes('failed to send request') || errorContent.includes('connection')) {
          errorContent = `🌐 接続エラー\n\nLLMサービスに接続できませんでした。\n\nインターネット接続を確認してください。`
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
    <div className="fixed bottom-4 right-4 z-50 flex h-[500px] w-[400px] flex-col rounded-lg bg-neutral-900 shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between rounded-t-lg bg-neutral-800 px-4 py-3">
        <div className="flex items-center space-x-2">
          <MessageCircle size={20} className="text-blue-500" />
          <span className="font-semibold text-white">{t('chat.title')}</span>
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
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-lg px-3 py-2 ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : msg.isError
                    ? 'bg-red-900/50 text-red-200 border border-red-700'
                    : 'bg-neutral-800 text-neutral-200'
              }`}
            >
              <div className="whitespace-pre-wrap break-words text-sm">{msg.content}</div>
              <div
                className={`mt-1 text-xs ${
                  msg.role === 'user' 
                    ? 'text-blue-200' 
                    : msg.isError 
                      ? 'text-red-400' 
                      : 'text-neutral-500'
                }`}
              >
                {new Date(msg.timestamp).toLocaleTimeString()}
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
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={t('chat.placeholder')}
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
    </div>
  )
}
