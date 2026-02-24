import https from 'https'
import http from 'http'
import fs from 'fs'
import path from 'path'
import os from 'os'

/**
 * Vision-capable model registry.
 * Maps provider+model combinations to their Vision API details.
 */

export interface VisionModelInfo {
  provider: string
  model: string
  supportsVision: boolean
  /** The model ID to use when calling the Vision API (may differ from chat model) */
  visionModel?: string
}

/**
 * Known Vision-capable models per provider.
 * OpenRouter model IDs are used as-is via their unified API.
 */
const VISION_MODELS: Record<string, Set<string>> = {
  openrouter: new Set([
    'google/gemini-2.0-flash-001',
    'google/gemini-pro-1.5',
    'anthropic/claude-3.5-sonnet',
    'anthropic/claude-3-5-sonnet',
    'anthropic/claude-3-haiku',
    'openai/gpt-4o',
    'openai/gpt-4o-mini'
  ]),
  anthropic: new Set([
    'claude-3-5-haiku-20241022',
    'claude-3-5-sonnet-20241022',
    'claude-3-opus-20240229',
    'claude-3-sonnet-20240229',
    'claude-3-haiku-20240307'
  ]),
  openai: new Set([
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4-turbo'
  ]),
  groq: new Set([
    'meta-llama/llama-4-scout-17b-16e-instruct',
    'meta-llama/llama-4-maverick-17b-128e-instruct',
    'llama-3.2-11b-vision-preview',
    'llama-3.2-90b-vision-preview'
  ]),
  ollama: new Set([
    'llava:latest',
    'llava:7b',
    'llava:13b',
    'llava-llama3:latest',
    'bakllava:latest',
    'moondream:latest',
    'moondream2:latest'
  ])
}

/**
 * Recommended Vision models for users who haven't configured a Vision LLM.
 */
const VISION_SETUP_MESSAGE =
  '🔍 画面検証にはVision LLMの設定が必要です。\n\n' +
  '設定 → picoclaw → 「👁️ 画面検証 Vision LLM」で設定してください。\n\n' +
  '無料のおすすめ:\n' +
  '  • Groq + Llama 4 Scout（クラウド・無料・高速・クレカ不要）\n' +
  '  • Ollama + Moondream2（ローカル・無料・CPU向き）\n\n' +
  '設定後、ロック・ログイン操作の結果を自動判定します。'

/**
 * Check if a model supports Vision.
 */
export function isVisionCapable(provider: string, model: string): boolean {
  const models = VISION_MODELS[provider]
  if (!models) return false
  return models.has(model)
}

/**
 * Check if Vision LLM is configured (separate from chat LLM).
 */
export function isVisionConfigured(): boolean {
  const { provider, model } = readVisionConfig()
  return provider !== '' && model !== '' && isVisionCapable(provider, model)
}

/**
 * Get the message to show when Vision is not configured.
 */
export function getVisionSetupMessage(): string {
  return VISION_SETUP_MESSAGE
}

/**
 * Read picoclaw config to get Vision-specific provider/model settings.
 * Vision LLM is configured separately from the chat LLM
 * (agents.defaults.vision_provider / vision_model).
 */
function readVisionConfig(): {
  provider: string
  model: string
  apiKey: string
  apiBase: string
} {
  const configPath = path.join(os.homedir(), '.picoclaw', 'config.json')
  try {
    const content = fs.readFileSync(configPath, 'utf-8')
    const config = JSON.parse(content)
    const provider = config.agents?.defaults?.vision_provider || ''
    const model = config.agents?.defaults?.vision_model || ''
    if (!provider || !model) {
      return { provider: '', model: '', apiKey: '', apiBase: '' }
    }
    const apiKey = config.providers?.[provider]?.api_key || ''
    const apiBase = config.providers?.[provider]?.api_base || ''
    return { provider, model, apiKey, apiBase }
  } catch {
    return { provider: '', model: '', apiKey: '', apiBase: '' }
  }
}

/**
 * Get the verification delay based on the Vision provider.
 * Ollama (local CPU inference) needs much longer timeouts.
 */
export function getVerificationDelay(provider?: string): number {
  const visionProvider = provider || readVisionConfig().provider
  switch (visionProvider) {
    case 'ollama':
      return 15000 // 15s delay before capture (local model needs time)
    default:
      return 12000 // 12s for cloud models
  }
}

/**
 * Get the API request timeout based on the Vision provider.
 */
function getApiTimeout(provider: string): number {
  switch (provider) {
    case 'ollama':
      return 120000 // 120s timeout for local CPU inference
    default:
      return 30000  // 30s for cloud APIs
  }
}

/**
 * Get the API base URL for a provider.
 */
function getApiBase(provider: string, configApiBase: string): string {
  if (configApiBase) return configApiBase

  switch (provider) {
    case 'openrouter': return 'https://openrouter.ai/api/v1'
    case 'anthropic': return 'https://api.anthropic.com'
    case 'openai': return 'https://api.openai.com/v1'
    case 'deepseek': return 'https://api.deepseek.com/v1'
    case 'groq': return 'https://api.groq.com/openai/v1'
    case 'ollama': return 'http://127.0.0.1:11434/v1'
    default: return 'https://openrouter.ai/api/v1'
  }
}

/**
 * Call Vision LLM to analyze a screen capture.
 * 
 * @param base64Image - JPEG image as base64 data URL
 * @param prompt - What to analyze in the image
 * @returns The LLM's text response
 */
export async function analyzeScreenWithVision(
  base64Image: string,
  prompt: string
): Promise<string> {
  const { provider, model, apiKey, apiBase } = readVisionConfig()

  if (!provider || !model || !isVisionCapable(provider, model)) {
    throw new Error('VISION_NOT_CONFIGURED')
  }

  const baseUrl = getApiBase(provider, apiBase)

  // Use Anthropic-specific API format
  if (provider === 'anthropic') {
    return callAnthropicVision(baseUrl, apiKey, model, base64Image, prompt, getApiTimeout(provider))
  }

  // OpenAI-compatible format (OpenRouter, OpenAI, Ollama, Groq, etc.)
  return callOpenAIVision(baseUrl, apiKey, model, base64Image, prompt, getApiTimeout(provider))
}

/**
 * OpenAI-compatible Vision API call (works with OpenRouter, OpenAI, Ollama).
 */
async function callOpenAIVision(
  baseUrl: string,
  apiKey: string,
  model: string,
  base64Image: string,
  prompt: string,
  timeout: number
): Promise<string> {
  // Strip data URL prefix if present
  const imageData = base64Image.replace(/^data:image\/\w+;base64,/, '')

  const body = JSON.stringify({
    model,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: prompt
          },
          {
            type: 'image_url',
            image_url: {
              url: `data:image/jpeg;base64,${imageData}`,
              detail: 'low' // Save tokens; low detail is sufficient for login screen detection
            }
          }
        ]
      }
    ],
    max_tokens: 300,
    temperature: 0.1 // Low temperature for deterministic analysis
  })

  return makeHttpRequest(baseUrl + '/chat/completions', apiKey, body, 'openai', timeout)
}

/**
 * Anthropic-specific Vision API call.
 */
async function callAnthropicVision(
  baseUrl: string,
  apiKey: string,
  model: string,
  base64Image: string,
  prompt: string,
  timeout: number
): Promise<string> {
  const imageData = base64Image.replace(/^data:image\/\w+;base64,/, '')

  const body = JSON.stringify({
    model,
    max_tokens: 300,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/jpeg',
              data: imageData
            }
          },
          {
            type: 'text',
            text: prompt
          }
        ]
      }
    ]
  })

  return makeHttpRequest(baseUrl + '/v1/messages', apiKey, body, 'anthropic', timeout)
}

/**
 * Make an HTTP/HTTPS request to an LLM API.
 */
function makeHttpRequest(
  url: string,
  apiKey: string,
  body: string,
  apiType: 'openai' | 'anthropic',
  timeout: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url)
    const isHttps = urlObj.protocol === 'https:'
    const transport = isHttps ? https : http

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Content-Length': String(Buffer.byteLength(body))
    }

    if (apiType === 'anthropic') {
      headers['x-api-key'] = apiKey
      headers['anthropic-version'] = '2023-06-01'
    } else {
      headers['Authorization'] = `Bearer ${apiKey}`
    }

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname,
      method: 'POST',
      headers
    }

    const req = transport.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data)

          // OpenAI format
          if (parsed.choices?.[0]?.message) {
            const content = parsed.choices[0].message.content
            // Handle empty content (e.g. moondream returning content:"")
            if (typeof content === 'string' && content.trim() === '') {
              console.warn('[Vision] LLM returned empty content, treating as UNKNOWN')
              resolve('UNKNOWN')
              return
            }
            if (content) {
              resolve(content)
              return
            }
          }

          // Anthropic format
          if (parsed.content?.[0]?.text) {
            resolve(parsed.content[0].text)
            return
          }

          // Error response
          if (parsed.error) {
            reject(new Error(parsed.error.message || JSON.stringify(parsed.error)))
            return
          }

          reject(new Error(`Unexpected API response: ${data.substring(0, 200)}`))
        } catch (e) {
          reject(new Error(`Failed to parse API response: ${data.substring(0, 200)}`))
        }
      })
    })

    req.on('error', (err) => reject(err))
    req.setTimeout(timeout, () => {
      req.destroy()
      reject(new Error(`Vision API request timed out (${timeout / 1000}s)`))
    })

    req.write(body)
    req.end()
  })
}
