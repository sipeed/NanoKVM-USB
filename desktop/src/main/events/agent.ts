/**
 * IPC event handlers for the agent abstraction layer.
 *
 * These handlers delegate to AgentRouter which dispatches
 * to the active AgentAdapter (PicoclawAdapter or ZeroclawAdapter).
 *
 * Existing PICOCLAW_* handlers remain unchanged for backward compatibility.
 *
 * @see docs/multi-agent-spec.md Section 7.1
 */

import { ipcMain } from 'electron'
import https from 'https'
import http from 'http'
import { IpcEvents } from '@common/ipc-events'
import { AgentRouter } from '../agent/router'
import { ConfigSyncService } from '../agent/config-sync'
import { AgentType } from '@common/agent-types'

/** provider → OpenAI-compatible base URL */
const PROVIDER_BASE_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  groq: 'https://api.groq.com/openai/v1',
  mistral: 'https://api.mistral.ai/v1',
  deepseek: 'https://api.deepseek.com/v1',
  xai: 'https://api.x.ai/v1',
  anthropic: 'https://api.anthropic.com', // special handling
  'github-copilot': 'https://models.inference.ai.azure.com',
  github_copilot: 'https://models.inference.ai.azure.com',
  copilot: 'https://models.inference.ai.azure.com',
  ollama: 'http://localhost:11434/v1'
}

/**
 * Make a minimal API call to test provider connectivity.
 * Returns { success, latencyMs } or throws with error message.
 */
async function testProviderConnection(
  provider: string,
  apiKey: string,
  model: string,
  apiBase?: string
): Promise<{ latencyMs: number }> {
  // Resolve base URL
  let baseUrl = apiBase || PROVIDER_BASE_URLS[provider] || ''
  if (!baseUrl) {
    if (provider.startsWith('custom:')) {
      baseUrl = provider.slice('custom:'.length)
    } else {
      throw new Error(`Unknown provider: ${provider}`)
    }
  }

  // Strip provider prefix from model (e.g. "groq/llama-3.1-8b-instant" → "llama-3.1-8b-instant")
  let bareModel = model
  const providerPrefix = provider + '/'
  if (bareModel.startsWith(providerPrefix)) {
    bareModel = bareModel.slice(providerPrefix.length)
  }

  const isAnthropic = provider === 'anthropic' || baseUrl.includes('anthropic.com')

  let body: string
  let path: string
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }

  if (isAnthropic) {
    path = '/v1/messages'
    headers['x-api-key'] = apiKey
    headers['anthropic-version'] = '2023-06-01'
    body = JSON.stringify({
      model: bareModel || 'claude-haiku-20240307',
      max_tokens: 3,
      messages: [{ role: 'user', content: 'Hi' }]
    })
  } else {
    path = baseUrl.endsWith('/v1') ? '/v1/chat/completions' : '/chat/completions'
    headers['Authorization'] = `Bearer ${apiKey}`
    body = JSON.stringify({
      model: bareModel,
      max_tokens: 3,
      messages: [{ role: 'user', content: 'Hi' }]
    })
  }

  // Build full path from baseUrl
  const url = new URL(isAnthropic ? baseUrl + path : baseUrl + '/chat/completions')
  headers['Content-Length'] = Buffer.byteLength(body).toString()

  const start = Date.now()
  return new Promise((resolve, reject) => {
    const transport = url.protocol === 'https:' ? https : http
    const req = transport.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers
      },
      (res) => {
        let data = ''
        res.on('data', (d) => (data += d))
        res.on('end', () => {
          const latencyMs = Date.now() - start
          const sc = res.statusCode || 0
          if (sc >= 200 && sc < 300) {
            resolve({ latencyMs })
          } else {
            let msg = `HTTP ${sc}`
            try {
              const j = JSON.parse(data)
              msg = j?.error?.message || j?.message || msg
            } catch (_) {}
            reject(new Error(msg))
          }
        })
      }
    )
    req.on('error', reject)
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Connection timeout')) })
    req.write(body)
    req.end()
  })
}

export function registerAgentHandlers(
  router: AgentRouter,
  configSync?: ConfigSyncService
): void {
  // Get current agent type
  ipcMain.handle(IpcEvents.AGENT_GET_TYPE, () => {
    try {
      return { success: true, type: router.getType() }
    } catch (error) {
      console.error('[IPC] Failed to get agent type:', error)
      return { success: false, error: String(error) }
    }
  })

  // Switch agent type (persists to shared config)
  ipcMain.handle(IpcEvents.AGENT_SET_TYPE, async (_event, type: AgentType) => {
    try {
      await router.setType(type)
      // Persist agent type to shared config
      if (configSync) {
        configSync.setAgentType(type)
      }
      return { success: true }
    } catch (error) {
      console.error('[IPC] Failed to set agent type:', error)
      return { success: false, error: String(error) }
    }
  })

  // Send message — unified path for Chat UI (Telegram uses router directly)
  ipcMain.handle(
    IpcEvents.AGENT_SEND_MESSAGE,
    async (_event, message: string, language?: string, sessionId?: string) => {
      try {
        const result = await router.sendMessage(message, language || 'en', sessionId)
        return { success: true, response: result.response }
      } catch (error) {
        console.error('[IPC] Failed to send agent message:', error)
        const err = error as Error & {
          rateLimit?: {
            waitSeconds: number
            waitTimeText: string
            limitType?: string
            limitValue?: number
            resetAt?: string
          }
        }
        return {
          success: false,
          error: String(err.message || err),
          rateLimit: err.rateLimit || undefined
        }
      }
    }
  )

  // Get config
  ipcMain.handle(IpcEvents.AGENT_GET_CONFIG, () => {
    try {
      const config = router.getConfig()
      return { success: true, config }
    } catch (error) {
      console.error('[IPC] Failed to get agent config:', error)
      return { success: false, error: String(error) }
    }
  })

  // Update config
  ipcMain.handle(IpcEvents.AGENT_UPDATE_CONFIG, (_event, updates: Record<string, unknown>) => {
    try {
      router.updateConfig(updates)
      return { success: true }
    } catch (error) {
      console.error('[IPC] Failed to update agent config:', error)
      return { success: false, error: String(error) }
    }
  })

  // Get version
  ipcMain.handle(IpcEvents.AGENT_GET_VERSION, async () => {
    try {
      const version = await router.getVersion()
      return { success: true, version }
    } catch (error) {
      console.error('[IPC] Failed to get agent version:', error)
      return { success: false, error: String(error) }
    }
  })

  // Get providers
  ipcMain.handle(IpcEvents.AGENT_GET_PROVIDERS, async () => {
    try {
      const data = await router.getProviders()
      return { success: true, ...data }
    } catch (error) {
      console.error('[IPC] Failed to get agent providers:', error)
      return { success: false, error: String(error), providers: [] }
    }
  })

  // Get agent status
  ipcMain.handle(IpcEvents.AGENT_GET_STATUS, () => {
    try {
      return { success: true, type: router.getType() }
    } catch (error) {
      console.error('[IPC] Failed to get agent status:', error)
      return { success: false, error: String(error) }
    }
  })

  // Test provider connection — calls LLM API directly (no zeroclaw overhead)
  ipcMain.handle(
    IpcEvents.AGENT_TEST_CONNECTION,
    async (_event, provider: string, apiKey: string, model: string, apiBase?: string) => {
      try {
        console.log(`[IPC] Testing connection: provider=${provider} model=${model}`)
        const { latencyMs } = await testProviderConnection(provider, apiKey, model, apiBase)
        console.log(`[IPC] Connection test OK: latency=${latencyMs}ms`)
        return { success: true, latencyMs }
      } catch (error) {
        console.error('[IPC] Connection test failed:', error)
        return { success: false, error: String((error as Error).message || error) }
      }
    }
  )
}
