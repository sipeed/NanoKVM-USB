import { ReactElement, useEffect, useRef, useState } from 'react'
import { Button, Input, message, Select, Space, Tooltip, Switch, Divider, Modal } from 'antd'
import { ClipboardIcon, ExternalLinkIcon, Eye, EyeOff, Shield, ShieldCheck, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IpcEvents } from '@common/ipc-events'
import { stripProtocolPrefix, ensureProtocolPrefix, getProtocolPrefix } from '@common/known-protocols'
import { ModelUpdateSettings, ModelUpdateSettingsRef } from './model-update'

interface PicoclawConfig {
  agents?: {
    defaults?: {
      provider?: string
      model?: string
      model_name?: string
      model_fallbacks?: string[]
      vision_provider?: string
      vision_model?: string
      max_tokens?: number
      temperature?: number
      max_tool_iterations?: number
      workspace?: string
      restrict_to_workspace?: boolean
    }
    // Go's AgentsConfig has a list field for multi-agent definitions
    list?: unknown[]
  }
  providers?: {
    [key: string]: {
      api_key?: string
      api_base?: string
    }
  }
  channels?: {
    telegram?: {
      enabled?: boolean
      token?: string
      proxy?: string
      allow_from?: string[]
    }
    [key: string]: unknown
  }
  model_update?: {
    cached_models?: Record<string, string[]>
  }
}

/** Dynamic provider from picoclaw CLI */
interface DynamicProvider {
  name: string
  label: string
  api_base: string
  key_url: string
  default_model: string
  auth_method: string
  models: string[]
}

/** UI-ready provider for Select components */
interface ProviderOption {
  value: string
  label: string
  defaultModel: string
  apiUrl: string
  authMethod: string // 'api_key' | 'none'
  models: Array<{ value: string; label: string; description?: string; vision?: boolean }>
}

/**
 * UI enrichment metadata for known providers and models.
 * Used to add descriptions, vision flags, and emoji labels to dynamically loaded providers.
 * When picoclaw adds new providers, they appear automatically with generic UI;
 * enrichment can be added here for better UX.
 */
const PROVIDER_UI_META: Record<
  string,
  {
    models?: Record<string, { label?: string; description?: string; vision?: boolean }>
  }
> = {
  openrouter: {
    models: {
      'meta-llama/llama-3.1-8b-instruct': { label: 'Llama 3.1 8B 💨 (推奨・無料枠)', description: '軽量・高速・トークン節約' },
      'google/gemini-2.0-flash-001': { label: 'Gemini 2.0 Flash 👁️ (Vision対応)', description: '高速・Vision対応・安価', vision: true },
      'google/gemini-pro-1.5': { label: 'Gemini Pro 1.5 (無料枠)', description: '中型・バランス' },
      'anthropic/claude-3.5-sonnet': { label: 'Claude 3.5 Sonnet 👁️', description: '大型・高品質・Vision対応', vision: true }
    }
  },
  anthropic: {
    models: {
      'claude-3-5-haiku-20241022': { label: 'Claude 3.5 Haiku 💨 (推奨)', description: '軽量・高速・コスト効率', vision: true },
      'claude-3-5-sonnet-20241022': { label: 'Claude 3.5 Sonnet 👁️', description: '大型・高品質・Vision対応', vision: true }
    }
  },
  openai: {
    models: {
      'gpt-4o-mini': { label: 'GPT-4o Mini 💨👁️ (推奨)', description: '軽量・高速・Vision対応', vision: true },
      'gpt-4o': { label: 'GPT-4o 👁️', description: '大型・高品質・Vision対応', vision: true }
    }
  },
  deepseek: {
    models: {
      'deepseek-chat': { label: 'DeepSeek Chat (推奨)', description: '標準モデル・安価' },
      'deepseek-coder': { label: 'DeepSeek Coder', description: 'コーディング特化' }
    }
  },
  groq: {
    models: {
      'llama-3.1-8b-instant': { label: 'Llama 3.1 8B Instant 💨 (推奨)', description: '軽量・超高速・トークン節約' },
      'meta-llama/llama-4-scout-17b-16e-instruct': { label: 'Llama 4 Scout 👁️ (Vision推奨)', description: 'Vision対応・無料・高速・最新', vision: true },
      'meta-llama/llama-4-maverick-17b-128e-instruct': { label: 'Llama 4 Maverick 👁️', description: 'Vision対応・無料・高品質', vision: true },
      'llama-3.2-11b-vision-preview': { label: 'Llama 3.2 11B Vision 👁️', description: 'Vision対応・無料・高速', vision: true },
      'llama-3.3-70b-versatile': { label: 'Llama 3.3 70B', description: '大型・高品質・トークン消費大' },
      'mixtral-8x7b-32768': { label: 'Mixtral 8x7B', description: '中型・バランス' }
    }
  },
  ollama: {
    models: {
      'llama3.2:1b': { label: 'Llama 3.2 1B 💨 (推奨)', description: '超軽量・高速・CPU向き' },
      'llama3.2:latest': { label: 'Llama 3.2 3B', description: '標準・バランス' },
      'moondream2:latest': { label: 'Moondream2 👁️ (軽量Vision)', description: 'Vision対応・1.7B・CPU向き', vision: true },
      'llava:latest': { label: 'LLaVA 👁️', description: 'Vision対応・7B・ローカル', vision: true },
      'qwen2.5:latest': { label: 'Qwen 2.5', description: '多言語対応' }
    }
  },
  mistral: {
    models: {
      'mistral/mistral-small-latest': { label: 'Mistral Small 💨 (推奨)', description: '軽量・高速・コスト効率' },
      'mistral/mistral-medium-latest': { label: 'Mistral Medium', description: '中型・バランス' },
      'mistral/mistral-large-latest': { label: 'Mistral Large', description: '大型・高品質' }
    }
  }
}

/**
 * Heuristic to detect if a model ID is likely Vision-capable.
 * Used for API-discovered models that aren't in PROVIDER_UI_META.
 */
const VISION_MODEL_PATTERNS = /vision|llava|moondream|gpt-4o|gpt-4\.1|scout|maverick|multimodal|gemini|claude-3/i

function isLikelyVisionModel(modelId: string): boolean {
  return VISION_MODEL_PATTERNS.test(modelId)
}

/**
 * Heuristic to filter out non-chat models returned by provider APIs.
 * These models don't support the chat completions endpoint and would
 * cause 400 errors like "whisper-large-v3-turbo does not support chat completions".
 *
 * Filters out:
 * - Speech-to-text (whisper, etc.)
 * - Text-to-speech / audio generation (orpheus, etc.)
 * - Safety/moderation models (llama-guard, prompt-guard, safeguard, etc.)
 * - Embedding models
 * - Image generation models
 * - Compound AI / orchestration models (not standard chat completions)
 * - Non-LLM utility models (allam, etc.)
 */
const NON_CHAT_MODEL_PATTERNS = /whisper|orpheus|guard|safeguard|embed|tts|speech|distil-whisper|stable-diffusion|dall-e|imagen|\bcompound\b|\ballam\b/i

function isNonChatModel(modelId: string): boolean {
  return NON_CHAT_MODEL_PATTERNS.test(modelId)
}

/**
 * Convert dynamic providers from picoclaw CLI to UI-ready format.
 * Merges three sources:
 *   1. Go static model list (picoclaw providers command)
 *   2. PROVIDER_UI_META (manually curated UI labels/descriptions)
 *   3. API-fetched cached_models (from model-updater auto-update)
 */
function buildProviderOptions(
  dynamicProviders: DynamicProvider[],
  cachedModels?: Record<string, string[]>
): ProviderOption[] {
  return dynamicProviders.map((dp) => {
    const meta = PROVIDER_UI_META[dp.name]
    const addedIds = new Set<string>()

    // Build model options: start with models from Go, enrich with UI metadata.
    // Go returns fully prefixed IDs (e.g., "groq/meta-llama/llama-4-scout-..."),
    // but PROVIDER_UI_META uses bare keys (e.g., "meta-llama/llama-4-scout-...").
    // Strip the known protocol prefix for enrichment lookup, track both forms for dedup.
    const modelOptions = dp.models.map((modelId) => {
      addedIds.add(modelId)
      const bareId = stripProtocolPrefix(modelId)
      addedIds.add(bareId) // prevent PROVIDER_UI_META from adding a duplicate
      const modelMeta = meta?.models?.[bareId] || meta?.models?.[modelId]
      return {
        value: modelId,
        label: modelMeta?.label || modelId,
        description: modelMeta?.description,
        vision: modelMeta?.vision || isLikelyVisionModel(modelId)
      }
    })

    // Also add any models from UI meta that aren't in Go's list (e.g., manually curated).
    // Always use provider-prefixed value so Go's ExtractProtocol() works correctly.
    if (meta?.models) {
      for (const [modelId, modelMeta] of Object.entries(meta.models)) {
        const prefixed = ensureProtocolPrefix(modelId, dp.name)
        if (!addedIds.has(modelId) && !addedIds.has(prefixed)) {
          addedIds.add(modelId)
          addedIds.add(prefixed)
          modelOptions.push({
            value: prefixed, // Always prefix for Go compatibility
            label: modelMeta.label || modelId,
            description: modelMeta.description,
            vision: modelMeta.vision || false
          })
        }
      }
    }

    // Merge API-fetched models (from model-updater cached_models).
    // Prefix with hosting provider name to ensure Go's ExtractProtocol() routes
    // to the correct provider endpoint.
    //
    // Cross-provider models (e.g., Groq hosting "openai/gpt-oss-120b") are valid —
    // the provider offers them through their API. We force-prefix with the hosting
    // provider: "groq/openai/gpt-oss-120b" → Go ExtractProtocol sees "groq",
    // normalizeModel strips it, API receives "openai/gpt-oss-120b".
    const apiModels = cachedModels?.[dp.name] || []
    for (const modelId of apiModels) {
      // Skip non-chat models (whisper, guard, orpheus, embeddings, etc.)
      // These don't support chat completions and would cause API errors.
      if (isNonChatModel(modelId)) {
        continue
      }
      // For cross-provider models (e.g., "openai/gpt-oss-120b" under groq),
      // force-prefix with hosting provider: "groq/openai/gpt-oss-120b".
      // ensureProtocolPrefix won't add groq/ because openai/ is already a known
      // protocol, so we must prepend directly.
      const existingPrefix = getProtocolPrefix(modelId)
      const fullId = (existingPrefix && existingPrefix !== dp.name)
        ? `${dp.name}/${modelId}`  // Force hosting provider prefix
        : ensureProtocolPrefix(modelId, dp.name)
      if (!addedIds.has(modelId) && !addedIds.has(fullId)) {
        addedIds.add(modelId)
        addedIds.add(fullId)
        const modelMeta = meta?.models?.[modelId]
        const vision = modelMeta?.vision || isLikelyVisionModel(modelId)
        modelOptions.push({
          value: fullId,
          label: modelMeta?.label || (vision ? `${modelId} 👁️` : modelId),
          description: modelMeta?.description || `(${dp.label}提供)`,
          vision
        })
      }
    }

    return {
      value: dp.name,
      label: dp.label,
      defaultModel: dp.default_model,
      apiUrl: dp.key_url,
      authMethod: dp.auth_method,
      models: modelOptions
    }
  })
}

/** Hardcoded fallback providers (used when picoclaw binary is unavailable) */
const FALLBACK_PROVIDERS: ProviderOption[] = [
  {
    value: 'groq', label: 'Groq', defaultModel: 'llama-3.1-8b-instant',
    apiUrl: 'https://console.groq.com/keys', authMethod: 'api_key',
    models: [
      { value: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant 💨 (推奨)', description: '軽量・超高速', vision: false },
      { value: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B', description: '大型・高品質', vision: false }
    ]
  },
  {
    value: 'openai', label: 'OpenAI', defaultModel: 'gpt-4o-mini',
    apiUrl: 'https://platform.openai.com/api-keys', authMethod: 'api_key',
    models: [
      { value: 'gpt-4o-mini', label: 'GPT-4o Mini 💨👁️', description: '軽量・高速', vision: true }
    ]
  },
  {
    value: 'ollama', label: 'Ollama (Local)', defaultModel: 'llama3.2:1b',
    apiUrl: 'https://ollama.ai/download', authMethod: 'none',
    models: [
      { value: 'llama3.2:1b', label: 'Llama 3.2 1B 💨', description: '超軽量・CPU向き', vision: false }
    ]
  }
]

/**
 * Vision LLM provider/model selection now uses the dynamic `providers` state
 * (from buildProviderOptions 3-source merge) filtered by `model.vision` flag.
 * No separate static list is needed.
 */

export const PicoclawSettings = (): ReactElement => {
  const { t } = useTranslation()

  const [loading, setLoading] = useState(false)
  const [config, setConfig] = useState<PicoclawConfig>({})
  const [provider, setProvider] = useState<string>('openrouter')
  const [apiKey, setApiKey] = useState<string>('')
  const [model, setModel] = useState<string>('')
  
  // Dynamic providers loaded from picoclaw binary
  const [providers, setProviders] = useState<ProviderOption[]>(FALLBACK_PROVIDERS)

  // GitHub Copilot / GitHub Models authentication state
  const [ghAuthDetected, setGhAuthDetected] = useState<boolean>(false)
  const [ghToken, setGhToken] = useState<string | null>(null)
  const [ghUser, setGhUser] = useState<string | null>(null)
  const [ghDetecting, setGhDetecting] = useState<boolean>(false)
  const [ghAuthInProgress, setGhAuthInProgress] = useState<boolean>(false)
  const [ghDeviceCode, setGhDeviceCode] = useState<string | null>(null)

  /** Check if a provider requires an API key */
  function requiresApiKey(providerName: string): boolean {
    const p = providers.find((pp) => pp.value === providerName)
    if (p?.authMethod === 'oauth') return false  // GitHub Copilot uses gh CLI token
    return p ? p.authMethod !== 'none' : providerName !== 'ollama' && providerName !== 'vllm'
  }

  /** Check if provider is GitHub Copilot / GitHub Models */
  function isCopilotProvider(providerName: string): boolean {
    return providerName === 'github-copilot' || providerName === 'copilot' || providerName === 'github_copilot'
  }

  /** Detect GitHub authentication via gh CLI */
  async function detectGitHubAuth(): Promise<void> {
    setGhDetecting(true)
    try {
      const result = await window.electron.ipcRenderer.invoke(IpcEvents.PICOCLAW_DETECT_GITHUB_AUTH)
      setGhAuthDetected(result.found)
      setGhToken(result.token || null)
      setGhUser(result.user || null)
    } catch (err) {
      console.error('Failed to detect GitHub auth:', err)
      setGhAuthDetected(false)
    } finally {
      setGhDetecting(false)
    }
  }

  /** Initiate GitHub authentication via gh auth login --web */
  async function initiateGitHubAuth(): Promise<void> {
    setGhAuthInProgress(true)
    setGhDeviceCode(null)
    try {
      const result = await window.electron.ipcRenderer.invoke(IpcEvents.PICOCLAW_INITIATE_GITHUB_AUTH)
      if (!result.success) {
        message.error(result.error || 'GitHub認証の開始に失敗しました')
        setGhAuthInProgress(false)
        return
      }

      setGhDeviceCode(result.code)
      // Open the device verification page in the browser
      await window.electron.ipcRenderer.invoke(IpcEvents.OPEN_EXTERNAL_URL, result.url)

      // Poll for auth completion
      const pollInterval = setInterval(async () => {
        try {
          const authResult = await window.electron.ipcRenderer.invoke(IpcEvents.PICOCLAW_DETECT_GITHUB_AUTH)
          if (authResult.found) {
            clearInterval(pollInterval)
            setGhAuthDetected(true)
            setGhToken(authResult.token || null)
            setGhUser(authResult.user || null)
            setGhAuthInProgress(false)
            setGhDeviceCode(null)
            message.success(`GitHub認証完了 (${authResult.user || 'OK'})`)
          }
        } catch {
          // continue polling
        }
      }, 3000)

      // Stop polling after 5 minutes
      setTimeout(() => {
        clearInterval(pollInterval)
        if (ghAuthInProgress) {
          setGhAuthInProgress(false)
          setGhDeviceCode(null)
          message.warning('GitHub認証がタイムアウトしました。再度お試しください。')
        }
      }, 300000)
    } catch (err) {
      console.error('Failed to initiate GitHub auth:', err)
      message.error(String(err))
      setGhAuthInProgress(false)
    }
  }

  /** Cancel ongoing GitHub auth */
  function cancelGitHubAuth(): void {
    window.electron.ipcRenderer.invoke(IpcEvents.PICOCLAW_CANCEL_GITHUB_AUTH)
    setGhAuthInProgress(false)
    setGhDeviceCode(null)
  }

  // Telegram settings
  const [telegramEnabled, setTelegramEnabled] = useState<boolean>(false)
  const [telegramToken, setTelegramToken] = useState<string>('')
  const [telegramUserId, setTelegramUserId] = useState<string>('')
  const [gatewayRunning, setGatewayRunning] = useState<boolean>(false)
  const [picoclawVersion, setPicoclawVersion] = useState<string>('')

  // Vision LLM settings (separate from chat LLM)
  const [visionProvider, setVisionProvider] = useState<string>('')
  const [visionModel, setVisionModel] = useState<string>('')
  const [visionApiKey, setVisionApiKey] = useState<string>('')

  // Ref for ModelUpdateSettings to consolidate save
  const modelUpdateRef = useRef<ModelUpdateSettingsRef>(null)

  // ── Credential Vault state ──
  const [vaultConfigured, setVaultConfigured] = useState<boolean>(false)
  const [vaultUnlocked, setVaultUnlocked] = useState<boolean>(false)
  const [vaultLoading, setVaultLoading] = useState<boolean>(false)
  const [vaultPin, setVaultPin] = useState<string>('')
  const [vaultDescription, setVaultDescription] = useState<string>('')
  const [vaultShowPin, setVaultShowPin] = useState<boolean>(false)
  const [vaultMasterPassword, setVaultMasterPassword] = useState<string>('')
  const [vaultMasterPasswordConfirm, setVaultMasterPasswordConfirm] = useState<string>('')
  const [vaultNewMasterPassword, setVaultNewMasterPassword] = useState<string>('')
  const [vaultNewMasterPasswordConfirm, setVaultNewMasterPasswordConfirm] = useState<string>('')
  const [vaultCurrentMasterPassword, setVaultCurrentMasterPassword] = useState<string>('')

  /** Load vault status from main process */
  async function loadVaultStatus(): Promise<void> {
    try {
      const result = await window.electron.ipcRenderer.invoke(IpcEvents.VAULT_STATUS)
      if (result.success) {
        setVaultConfigured(result.configured)
        setVaultUnlocked(result.unlocked)
        // If unlocked, load the credential
        if (result.unlocked) {
          await loadVaultCredential()
        }
      }
    } catch (err) {
      console.error('[Vault] Failed to load status:', err)
    }
  }

  /** Load decrypted credential (only works when unlocked) */
  async function loadVaultCredential(): Promise<void> {
    try {
      const result = await window.electron.ipcRenderer.invoke(IpcEvents.VAULT_GET_CREDENTIAL)
      if (result.success && result.credential) {
        setVaultPin(result.credential.pin || '')
        setVaultDescription(result.credential.description || '')
      }
    } catch (err) {
      console.error('[Vault] Failed to load credential:', err)
    }
  }

  /** Setup vault for the first time */
  async function handleVaultSetup(): Promise<void> {
    if (!vaultMasterPassword) {
      message.error('マスターパスワードを入力してください')
      return
    }
    if (vaultMasterPassword !== vaultMasterPasswordConfirm) {
      message.error('マスターパスワードが一致しません')
      return
    }
    if (!vaultPin) {
      message.error('PINまたはパスワードを入力してください')
      return
    }

    setVaultLoading(true)
    try {
      const credential = {
        pin: vaultPin,
        username: '',
        description: vaultDescription || 'Windows PC'
      }
      const result = await window.electron.ipcRenderer.invoke(
        IpcEvents.VAULT_SETUP,
        vaultMasterPassword,
        credential
      )
      if (result.success) {
        message.success('🔐 Credential Vault を設定しました')
        setVaultConfigured(true)
        setVaultUnlocked(true)
        setVaultMasterPassword('')
        setVaultMasterPasswordConfirm('')
      } else {
        message.error(result.error || 'Vault セットアップに失敗しました')
      }
    } catch (err) {
      console.error('[Vault] Setup failed:', err)
      message.error(String(err))
    } finally {
      setVaultLoading(false)
    }
  }

  /** Unlock vault with master password */
  async function handleVaultUnlock(): Promise<void> {
    if (!vaultCurrentMasterPassword) {
      message.error('マスターパスワードを入力してください')
      return
    }

    setVaultLoading(true)
    try {
      const result = await window.electron.ipcRenderer.invoke(
        IpcEvents.VAULT_UNLOCK,
        vaultCurrentMasterPassword
      )
      if (result.success) {
        message.success('🔓 Vault を解錠しました')
        setVaultUnlocked(true)
        setVaultCurrentMasterPassword('')
        await loadVaultCredential()
      } else {
        message.error(result.error || 'マスターパスワードが正しくありません')
      }
    } catch (err) {
      console.error('[Vault] Unlock failed:', err)
      message.error(String(err))
    } finally {
      setVaultLoading(false)
    }
  }

  /** Lock vault */
  async function handleVaultLock(): Promise<void> {
    try {
      await window.electron.ipcRenderer.invoke(IpcEvents.VAULT_LOCK)
      setVaultUnlocked(false)
      setVaultPin('')
      setVaultDescription('')
      message.info('🔒 Vault をロックしました')
    } catch (err) {
      console.error('[Vault] Lock failed:', err)
    }
  }

  /** Save updated credential (while vault is unlocked) */
  async function handleVaultSave(): Promise<void> {
    if (!vaultPin) {
      message.error('PINまたはパスワードを入力してください')
      return
    }

    setVaultLoading(true)
    try {
      const credential = {
        pin: vaultPin,
        username: '',
        description: vaultDescription || 'Windows PC'
      }
      const result = await window.electron.ipcRenderer.invoke(IpcEvents.VAULT_SAVE, credential)
      if (result.success) {
        message.success('認証情報を更新しました')
      } else {
        message.error(result.error || '保存に失敗しました')
      }
    } catch (err) {
      console.error('[Vault] Save failed:', err)
      message.error(String(err))
    } finally {
      setVaultLoading(false)
    }
  }

  /** Change master password */
  async function handleVaultChangePassword(): Promise<void> {
    if (!vaultNewMasterPassword) {
      message.error('新しいマスターパスワードを入力してください')
      return
    }
    if (vaultNewMasterPassword !== vaultNewMasterPasswordConfirm) {
      message.error('新しいマスターパスワードが一致しません')
      return
    }

    setVaultLoading(true)
    try {
      const result = await window.electron.ipcRenderer.invoke(
        IpcEvents.VAULT_CHANGE_PASSWORD,
        vaultNewMasterPassword
      )
      if (result.success) {
        message.success('マスターパスワードを変更しました')
        setVaultNewMasterPassword('')
        setVaultNewMasterPasswordConfirm('')
      } else {
        message.error(result.error || 'パスワード変更に失敗しました')
      }
    } catch (err) {
      console.error('[Vault] Change password failed:', err)
      message.error(String(err))
    } finally {
      setVaultLoading(false)
    }
  }

  /** Delete vault entirely */
  async function handleVaultDelete(): Promise<void> {
    Modal.confirm({
      title: '⚠️ Vault を削除',
      content: '保存済みのログイン認証情報がすべて削除されます。この操作は元に戻せません。',
      okText: '削除',
      cancelText: 'キャンセル',
      okButtonProps: { danger: true },
      onOk: async () => {
        setVaultLoading(true)
        try {
          const result = await window.electron.ipcRenderer.invoke(IpcEvents.VAULT_DELETE)
          if (result.success) {
            message.success('Vault を削除しました')
            setVaultConfigured(false)
            setVaultUnlocked(false)
            setVaultPin('')
            setVaultDescription('')
            setVaultMasterPassword('')
            setVaultMasterPasswordConfirm('')
          } else {
            message.error(result.error || '削除に失敗しました')
          }
        } catch (err) {
          console.error('[Vault] Delete failed:', err)
          message.error(String(err))
        } finally {
          setVaultLoading(false)
        }
      }
    })
  }

  useEffect(() => {
    loadProviders()
    loadConfig()
    loadGatewayStatus()
    loadVersion()
    loadVaultStatus()
  }, [])

  async function loadProviders(): Promise<void> {
    try {
      // Fetch both providers (Go static list) and config (API cached models) in parallel
      const [provResult, cfgResult] = await Promise.all([
        window.electron.ipcRenderer.invoke(IpcEvents.PICOCLAW_GET_PROVIDERS),
        window.electron.ipcRenderer.invoke(IpcEvents.PICOCLAW_GET_CONFIG)
      ])
      const cachedModels = cfgResult?.config?.model_update?.cached_models as
        | Record<string, string[]>
        | undefined
      if (provResult.success && provResult.providers?.length > 0) {
        const dynamicProviders = buildProviderOptions(
          provResult.providers as DynamicProvider[],
          cachedModels
        )
        setProviders(dynamicProviders)
        const cachedCount = cachedModels ? Object.keys(cachedModels).length : 0
        console.log(
          `[Picoclaw] Loaded ${dynamicProviders.length} providers (cached models from ${cachedCount} providers)`
        )
      } else {
        console.warn('[Picoclaw] Failed to load dynamic providers, using fallback')
      }
    } catch (err) {
      console.error('[Picoclaw] Error loading providers:', err)
    }
  }

  async function loadConfig(): Promise<void> {
    try {
      const result = await window.electron.ipcRenderer.invoke(IpcEvents.PICOCLAW_GET_CONFIG)
      if (result.success && result.config) {
        setConfig(result.config)
        
        // Load current values
        const currentProvider = result.config.agents?.defaults?.provider || 'openrouter'
        setProvider(currentProvider)
        // Go's GetModelName() prioritises model_name over model — read both.
        // Normalize: ensure model has provider prefix (e.g. "groq/meta-llama/...")
        // to match dropdown values.  Old configs may lack the prefix.
        const rawModel = result.config.agents?.defaults?.model_name || result.config.agents?.defaults?.model || ''
        setModel(ensureProtocolPrefix(rawModel, currentProvider))
        
        // Load API key for current provider
        if (result.config.providers?.[currentProvider]?.api_key) {
          setApiKey(result.config.providers[currentProvider].api_key)
        }
        
        // Load Vision LLM settings
        const vp = result.config.agents?.defaults?.vision_provider || ''
        setVisionProvider(vp)
        setVisionModel(result.config.agents?.defaults?.vision_model || '')
        if (vp && result.config.providers?.[vp]?.api_key) {
          setVisionApiKey(result.config.providers[vp].api_key)
        }

        // Load Telegram settings
        if (result.config.channels?.telegram) {
          setTelegramEnabled(result.config.channels.telegram.enabled || false)
          setTelegramToken(result.config.channels.telegram.token || '')
          if (result.config.channels.telegram.allow_from?.length > 0) {
            setTelegramUserId(result.config.channels.telegram.allow_from[0])
          }
        }

        // Auto-detect GitHub auth if the saved provider is GitHub Copilot
        if (isCopilotProvider(currentProvider)) {
          detectGitHubAuth()
        }
      }
    } catch (err) {
      console.error('Failed to load picoclaw config:', err)
    }
  }

  async function loadVersion(): Promise<void> {
    try {
      const result = await window.electron.ipcRenderer.invoke(IpcEvents.PICOCLAW_GET_VERSION)
      if (result.success && result.version) {
        setPicoclawVersion(result.version)
      }
    } catch (err) {
      console.error('Failed to load picoclaw version:', err)
    }
  }

  async function loadGatewayStatus(): Promise<void> {
    try {
      const result = await window.electron.ipcRenderer.invoke(IpcEvents.PICOCLAW_GATEWAY_STATUS)
      if (result.success && result.status) {
        setGatewayRunning(result.status.running || false)
      }
    } catch (err) {
      console.error('Failed to load gateway status:', err)
    }
  }

  async function handleSave(): Promise<void> {
    // GitHub Copilot: require gh auth instead of API key
    if (isCopilotProvider(provider)) {
      if (!ghAuthDetected || !ghToken) {
        message.error('GitHub認証が必要です。「🔑 GitHub 認証を開始」ボタンから認証してください。')
        return
      }
    } else if (!apiKey && requiresApiKey(provider)) {
      message.error(t('settings.picoclaw.apiKeyRequired'))
      return
    }

    // Vision provider is GitHub Copilot but no gh auth
    if (visionProvider && isCopilotProvider(visionProvider) && (!ghAuthDetected || !ghToken)) {
      message.error('Vision用GitHub Copilotにはgh認証が必要です。「🔑 GitHub 認証を開始」ボタンから認証してください。')
      return
    }

    setLoading(true)
    try {
      // Update config
      const providerEntry: Record<string, unknown> = {
        api_key: apiKey,
        api_base: config.providers?.[provider]?.api_base || ''
      }
      
      // For GitHub Copilot: use gh token as API key, set GitHub Models base URL
      if (isCopilotProvider(provider) && ghToken) {
        providerEntry.api_key = ghToken
        providerEntry.api_base = 'https://models.inference.ai.azure.com'
      }

      const providersUpdate: Record<string, Record<string, unknown>> = {
        ...config.providers,
        [provider]: providerEntry
      }

      // Save Vision provider API key if it's a different provider
      if (visionProvider && visionProvider !== provider) {
        if (isCopilotProvider(visionProvider)) {
          // GitHub Copilot as Vision-only: use gh token
          if (ghToken) {
            providersUpdate[visionProvider] = {
              api_key: ghToken,
              api_base: 'https://models.inference.ai.azure.com'
            }
          }
        } else if (requiresApiKey(visionProvider)) {
          providersUpdate[visionProvider] = {
            api_key: visionApiKey,
            api_base: config.providers?.[visionProvider]?.api_base || ''
          }
        }
      }

      // Set max_tokens per provider to avoid exceeding API limits.
      // max_tokens controls the maximum OUTPUT length (not context window).
      // Go upstream default is 32768, but for picoclaw chat/tool-use, 4096 is
      // more than sufficient and avoids 413/402 errors with limited-credit or
      // free-tier providers.
      const providerMaxTokens: Record<string, number> = {
        groq: 1024,
        'github-copilot': 4096,
      }
      const maxTokensUpdate: { max_tokens: number } = {
        max_tokens: providerMaxTokens[provider] ?? 4096,
      }

      // Ensure model has protocol prefix before writing to config.
      // Dropdown values should already be prefixed after buildProviderOptions fix,
      // but normalize as a safety net for edge cases (manual input, old state).
      const rawModel = model || providers.find((p) => p.value === provider)?.defaultModel || ''

      // Ensure correct provider routing for cross-provider models.
      // If model has a known-protocol prefix different from the selected provider
      // (e.g., "openai/gpt-oss-120b" under groq), force the hosting provider prefix:
      // "groq/openai/gpt-oss-120b" → Go ExtractProtocol sees "groq" → correct routing.
      const modelPrefix = getProtocolPrefix(rawModel)
      let normalizedModel: string
      if (modelPrefix && modelPrefix !== provider) {
        // Cross-provider model: force hosting provider prefix
        normalizedModel = `${provider}/${rawModel}`
        console.info(
          `[picoclaw] Cross-provider model: "${rawModel}" → "${normalizedModel}" (routed via ${provider})`
        )
      } else {
        normalizedModel = ensureProtocolPrefix(rawModel, provider)
      }

      const updates: PicoclawConfig = {
        agents: {
          // Preserve agents.list and other keys (deep merge)
          ...config.agents,
          defaults: {
            ...config.agents?.defaults,
            provider,
            model: normalizedModel,
            // Keep model_name in sync — Go's GetModelName() prioritises model_name
            // over model, so stale model_name causes provider mismatch.
            model_name: normalizedModel,
            ...maxTokensUpdate,
            vision_provider: visionProvider || undefined,
            vision_model: visionModel || undefined
          }
        },
        providers: providersUpdate,
        channels: {
          // Preserve other channel configs (e.g. discord) — deep merge
          ...config.channels,
          telegram: {
            enabled: telegramEnabled,
            token: telegramToken,
            proxy: config.channels?.telegram?.proxy || '',
            allow_from: telegramUserId ? [telegramUserId] : []
          }
        }
      }

      const result = await window.electron.ipcRenderer.invoke(
        IpcEvents.PICOCLAW_UPDATE_CONFIG,
        updates
      )

      if (result.success) {
        // Also save model update schedule
        await modelUpdateRef.current?.save()

        message.success(t('settings.picoclaw.saved'))
        await loadConfig()

        // Auto-restart gateway if it's running so it picks up the new config
        if (gatewayRunning) {
          try {
            await window.electron.ipcRenderer.invoke(IpcEvents.PICOCLAW_STOP_GATEWAY)
            await window.electron.ipcRenderer.invoke(IpcEvents.PICOCLAW_START_GATEWAY)
            message.info('Telegram Gatewayを再起動しました（新しい設定を適用）')
          } catch (restartErr) {
            console.error('Failed to restart gateway:', restartErr)
            message.warning('Gateway再起動に失敗しました。手動で再起動してください。')
            setGatewayRunning(false)
          }
        }
      } else {
        message.error(result.error || 'Failed to save config')
      }
    } catch (err) {
      console.error('Failed to save picoclaw config:', err)
      message.error(String(err))
    } finally {
      setLoading(false)
    }
  }

  async function handleTest(): Promise<void> {
    if (!apiKey && requiresApiKey(provider)) {
      message.error(t('settings.picoclaw.apiKeyRequired'))
      return
    }

    setLoading(true)
    try {
      // Save first
      await handleSave()

      // Test with a simple message
      const result = await window.electron.ipcRenderer.invoke(
        IpcEvents.PICOCLAW_SEND_MESSAGE,
        'Hello! Please respond with a short greeting.'
      )

      if (result.success) {
        message.success(t('settings.picoclaw.testSuccess'))
        console.log('Picoclaw response:', result.response)
      } else {
        message.error(result.error || 'Test failed')
      }
    } catch (err) {
      console.error('Failed to test picoclaw:', err)
      message.error(String(err))
    } finally {
      setLoading(false)
    }
  }

  async function handleStartGateway(): Promise<void> {
    if (!telegramToken || !telegramUserId) {
      message.error('Telegram TokenとUser IDを入力してください')
      return
    }

    setLoading(true)
    try {
      // Save config first
      await handleSave()

      // Start gateway
      const result = await window.electron.ipcRenderer.invoke(IpcEvents.PICOCLAW_START_GATEWAY)
      if (result.success) {
        message.success('Telegram Gateway起動中...')
        setGatewayRunning(true)
      } else {
        message.error(result.error || 'Gateway起動失敗')
      }
    } catch (err) {
      console.error('Failed to start gateway:', err)
      message.error(String(err))
    } finally {
      setLoading(false)
    }
  }

  async function handleStopGateway(): Promise<void> {
    setLoading(true)
    try {
      const result = await window.electron.ipcRenderer.invoke(IpcEvents.PICOCLAW_STOP_GATEWAY)
      if (result.success) {
        message.success('Telegram Gateway停止しました')
        setGatewayRunning(false)
      } else {
        message.error(result.error || 'Gateway停止失敗')
      }
    } catch (err) {
      console.error('Failed to stop gateway:', err)
      message.error(String(err))
    } finally {
      setLoading(false)
    }
  }

  /**
   * Sync Vision LLM settings when a Vision-capable chat model is selected.
   * Only auto-fills if Vision LLM is not already configured.
   */
  function syncVisionIfCapable(chatProvider: string, chatModel: string): void {
    // Check if the selected chat model is Vision-capable
    const providerData = providers.find((p) => p.value === chatProvider)
    const modelData = providerData?.models?.find((m) => m.value === chatModel)
    if (!modelData?.vision) return

    // Only auto-sync if Vision LLM is not yet configured
    if (visionProvider && visionModel) return

    // Check if this provider+model exists in dynamic providers as vision-capable
    const vp = providers.find((p) => p.value === chatProvider)
    if (vp) {
      const vm = vp.models.find((m) => m.value === chatModel && m.vision)
      if (vm) {
        setVisionProvider(chatProvider)
        setVisionModel(chatModel)
        // API key is shared (same provider)
        setVisionApiKey(config.providers?.[chatProvider]?.api_key || '')
        message.info('チャットモデルがVision対応のため、画面検証にも同じモデルを設定しました')
      }
    }
  }

  function handleProviderChange(value: string): void {
    setProvider(value)
    
    // Load API key for the new provider
    if (config.providers?.[value]?.api_key) {
      setApiKey(config.providers[value].api_key)
    } else {
      setApiKey('')
    }
    
    // Set default model
    const defaultModel = providers.find((p) => p.value === value)?.defaultModel || ''
    setModel(defaultModel)

    // Auto-detect GitHub auth when GitHub Copilot is selected
    if (isCopilotProvider(value)) {
      detectGitHubAuth()
    }

    // Auto-sync Vision if the default model is Vision-capable
    syncVisionIfCapable(value, defaultModel)
  }

  async function openApiKeyPage(): Promise<void> {
    const currentProvider = providers.find((p) => p.value === provider)
    if (currentProvider?.apiUrl) {
      await window.electron.ipcRenderer.invoke(IpcEvents.OPEN_EXTERNAL_URL, currentProvider.apiUrl)
      message.info(t('settings.picoclaw.openedBrowser'))
    }
  }

  async function pasteFromClipboard(): Promise<void> {
    try {
      const text = await navigator.clipboard.readText()
      if (!text) {
        message.warning(t('settings.picoclaw.clipboardEmpty'))
        return
      }

      // Validate API key format (basic validation)
      const trimmedText = text.trim()
      if (trimmedText.length < 10) {
        message.error(t('settings.picoclaw.invalidApiKey'))
        return
      }

      setApiKey(trimmedText)
      message.success(t('settings.picoclaw.pastedFromClipboard'))
    } catch (err) {
      console.error('Failed to read clipboard:', err)
      message.error(t('settings.picoclaw.clipboardError'))
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold">{t('settings.picoclaw.title')}</h2>
          {picoclawVersion && (
            <span className="rounded bg-neutral-700 px-2 py-0.5 text-xs text-neutral-400">
              picoclaw {picoclawVersion}
            </span>
          )}
        </div>
        <p className="mt-2 text-sm text-neutral-400">{t('settings.picoclaw.description')}</p>
      </div>

      <div className="space-y-4">
        {/* Provider Selection */}
        <div>
          <label className="mb-2 block text-sm font-medium">
            {t('settings.picoclaw.provider')}
          </label>
          <Select
            value={provider}
            onChange={handleProviderChange}
            className="w-full"
            options={providers}
            size="large"
          />
        </div>

        {/* API Key */}
        {requiresApiKey(provider) && (
          <div>
            <label className="mb-2 block text-sm font-medium">
              {t('settings.picoclaw.apiKey')}
            </label>
            <Space.Compact className="w-full">
              <Input.Password
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                size="large"
                autoComplete="off"
                className="flex-1"
              />
              <Tooltip title={t('settings.picoclaw.pasteTooltip')}>
                <Button
                  size="large"
                  icon={<ClipboardIcon size={16} />}
                  onClick={pasteFromClipboard}
                />
              </Tooltip>
              <Tooltip title={t('settings.picoclaw.getKeyTooltip')}>
                <Button
                  size="large"
                  icon={<ExternalLinkIcon size={16} />}
                  onClick={openApiKeyPage}
                />
              </Tooltip>
            </Space.Compact>
            <p className="mt-1 text-xs text-neutral-500">
              {t('settings.picoclaw.apiKeyHint')}
            </p>
          </div>
        )}

        {/* GitHub Copilot Auth Status */}
        {isCopilotProvider(provider) && (
          <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 p-4">
            <label className="mb-2 block text-sm font-medium">
              🤖 GitHub Copilot 接続設定
            </label>
            {ghDetecting ? (
              <p className="text-sm text-neutral-400">GitHub 認証を確認中...</p>
            ) : ghAuthDetected ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
                  <span className="text-sm text-green-400">GitHub 認証済み</span>
                </div>
                {ghUser && (
                  <p className="text-xs text-neutral-500">
                    ユーザー: {ghUser}
                  </p>
                )}
                <p className="mt-2 text-xs text-neutral-400">
                  💡 GitHub Models API を使用します。保存するとトークンが自動設定されます。
                </p>
              </div>
            ) : ghAuthInProgress ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-yellow-500" />
                  <span className="text-sm text-yellow-400">認証を待機中...</span>
                </div>
                {ghDeviceCode && (
                  <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3">
                    <p className="mb-1 text-xs text-neutral-400">
                      ブラウザで以下のコードを入力してください:
                    </p>
                    <p className="font-mono text-2xl font-bold tracking-widest text-yellow-300">
                      {ghDeviceCode}
                    </p>
                    <p className="mt-2 text-xs text-neutral-500">
                      github.com/login/device が開いています。コードを入力して認証を完了してください。
                    </p>
                  </div>
                )}
                <Button size="small" onClick={cancelGitHubAuth}>
                  キャンセル
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
                  <span className="text-sm text-red-400">GitHub 認証が必要です</span>
                </div>
                <p className="text-xs text-neutral-500">
                  ボタンをクリックしてブラウザで GitHub 認証を行います。
                </p>
                <Space>
                  <Button
                    type="primary"
                    size="small"
                    onClick={initiateGitHubAuth}
                  >
                    🔑 GitHub 認証を開始
                  </Button>
                  <Button
                    size="small"
                    onClick={detectGitHubAuth}
                  >
                    再検出
                  </Button>
                </Space>
                <p className="text-xs text-neutral-500">
                  ※ <code className="rounded bg-neutral-700 px-1">gh</code> CLI のインストールが必要です（<a href="https://cli.github.com" className="text-blue-400 hover:underline" onClick={(e) => { e.preventDefault(); window.electron.ipcRenderer.invoke(IpcEvents.OPEN_EXTERNAL_URL, 'https://cli.github.com') }}>cli.github.com</a>）
                </p>
              </div>
            )}
          </div>
        )}

        {/* Model Selection */}
        <div>
          <label className="mb-2 block text-sm font-medium">
            {t('settings.picoclaw.model')}
          </label>
          <Select
            value={model}
            onChange={(value) => {
              setModel(value)
              syncVisionIfCapable(provider, value)
            }}
            placeholder={providers.find((p) => p.value === provider)?.defaultModel}
            size="large"
            className="w-full"
            options={
              providers.find((p) => p.value === provider)?.models?.map((m) => ({
                value: m.value,
                label: (
                  <div className="flex items-center justify-between">
                    <span>{m.label}</span>
                    {m.description && (
                      <span className="ml-2 text-xs text-neutral-500">{m.description}</span>
                    )}
                  </div>
                )
              })) || []
            }
          />
          <p className="mt-1 text-xs text-neutral-500">{t('settings.picoclaw.modelHint')}</p>
        </div>

        {/* Vision LLM Settings */}
        <Divider />
        <div>
          <h3 className="mb-2 text-lg font-semibold">👁️ 画面検証 Vision LLM</h3>
          <p className="mb-4 text-xs text-neutral-400">
            ロック・ログイン後の画面をキャプチャして結果を自動判定します。チャット用LLMとは別に設定できます。
          </p>

          {/* Vision Provider */}
          <div className="mb-4">
            <label className="mb-2 block text-sm font-medium">Vision プロバイダ</label>
            <Select
              value={visionProvider || undefined}
              onChange={(value) => {
                setVisionProvider(value || '')
                // Find default vision model from dynamic providers
                const vp = providers.find((p) => p.value === value)
                const visionModels = vp?.models?.filter((m) => m.vision) || []
                setVisionModel(visionModels[0]?.value || vp?.defaultModel || '')
                // Load API key if already configured
                if (value && config.providers?.[value]?.api_key) {
                  setVisionApiKey(config.providers[value].api_key)
                } else if (value === provider) {
                  setVisionApiKey(apiKey)
                } else {
                  setVisionApiKey('')
                }
              }}
              placeholder="無効（画面検証しない）"
              allowClear
              size="large"
              className="w-full"
              options={providers
                .filter((p) => p.models?.some((m) => m.vision))
                .map((vp) => ({ value: vp.value, label: vp.label }))}
            />
            <p className="mt-1 text-xs text-neutral-500">
              無料推奨: Groq（クレカ不要）、GitHub Copilot（gh認証のみ）、またはOllama（ローカル）
            </p>
          </div>

          {/* Vision API Key (only if different provider, not ollama, not copilot) */}
          {visionProvider && requiresApiKey(visionProvider) && !isCopilotProvider(visionProvider) && visionProvider !== provider && (
            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium">Vision API Key</label>
              <Input.Password
                value={visionApiKey}
                onChange={(e) => setVisionApiKey(e.target.value)}
                placeholder="gsk_..."
                size="large"
                autoComplete="off"
              />
              <p className="mt-1 text-xs text-neutral-500">
                {visionProvider === 'groq'
                  ? 'console.groq.com/keys でAPIキーを取得（無料・クレカ不要）'
                  : `${visionProvider} 用の API キー`}
              </p>
            </div>
          )}

          {/* GitHub Copilot Vision: show auth status */}
          {visionProvider && isCopilotProvider(visionProvider) && (
            <div className="mb-4 rounded-lg border border-neutral-700 bg-neutral-800/50 p-3">
              {ghAuthDetected ? (
                <div className="flex items-center gap-2 text-sm text-green-400">
                  <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
                  GitHub 認証済み — Vision にも gh トークンを使用します
                </div>
              ) : ghAuthInProgress ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-yellow-400">
                    <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-yellow-500" />
                    認証を待機中...
                  </div>
                  {ghDeviceCode && (
                    <p className="font-mono text-lg font-bold tracking-widest text-yellow-300">
                      {ghDeviceCode}
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-yellow-400">
                    <span className="inline-block h-2 w-2 rounded-full bg-yellow-500" />
                    GitHub 認証が必要です
                  </div>
                  <Button size="small" type="primary" onClick={initiateGitHubAuth}>
                    🔑 GitHub 認証を開始
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Vision Model */}
          {visionProvider && (
            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium">Vision モデル</label>
              <Select
                value={visionModel || undefined}
                onChange={(value) => setVisionModel(value)}
                placeholder="モデルを選択"
                size="large"
                className="w-full"
                options={
                  (providers.find((p) => p.value === visionProvider)?.models
                    ?.filter((m) => m.vision)
                    ?.map((m) => ({
                      value: m.value,
                      label: (
                        <div className="flex items-center justify-between">
                          <span>{m.label}</span>
                          {m.description && (
                            <span className="ml-2 text-xs text-neutral-500">{m.description}</span>
                          )}
                        </div>
                      )
                    }))) || []
                }
              />
              {visionProvider === 'ollama' && (
                <p className="mt-1 text-xs text-yellow-500">
                  ⚠️ Intel Mac ではCPU推論になるため応答に30秒〜数分かかります
                </p>
              )}
            </div>
          )}
        </div>

        {/* Model List Auto-Update */}
        <Divider />

        {/* ── Credential Vault ── */}
        <div>
          <h3 className="mb-2 text-lg font-semibold">🔐 ログイン認証情報</h3>
          <p className="mb-4 text-xs text-neutral-400">
            Windows のログイン PIN/パスワードを暗号化して安全に保存します。チャットに認証情報を入力する必要がなくなります。
          </p>

          {/* Status indicator */}
          <div className="mb-4 flex items-center gap-2">
            <span className="text-sm font-medium">ステータス:</span>
            {!vaultConfigured ? (
              <span className="flex items-center gap-1 text-sm text-neutral-500">
                <Shield size={14} />
                未設定
              </span>
            ) : vaultUnlocked ? (
              <span className="flex items-center gap-1 text-sm text-green-400">
                <ShieldCheck size={14} />
                解錠済み
              </span>
            ) : (
              <span className="flex items-center gap-1 text-sm text-yellow-400">
                <Shield size={14} />
                ロック中
              </span>
            )}
          </div>

          {/* Case 1: Not configured — initial setup */}
          {!vaultConfigured && (
            <div className="space-y-4 rounded-lg border border-neutral-700 bg-neutral-800/50 p-4">
              <p className="text-sm font-medium">初回セットアップ</p>

              {/* PIN input */}
              <div>
                <label className="mb-1 block text-sm text-neutral-400">
                  Windows PIN / パスワード
                </label>
                <Space.Compact className="w-full">
                  <Input
                    type={vaultShowPin ? 'text' : 'password'}
                    value={vaultPin}
                    onChange={(e) => setVaultPin(e.target.value)}
                    placeholder="例: 1234"
                    size="large"
                    autoComplete="off"
                    className="flex-1"
                  />
                  <Tooltip title={vaultShowPin ? '非表示' : '表示'}>
                    <Button
                      size="large"
                      icon={vaultShowPin ? <EyeOff size={16} /> : <Eye size={16} />}
                      onClick={() => setVaultShowPin(!vaultShowPin)}
                    />
                  </Tooltip>
                </Space.Compact>
              </div>

              {/* Description */}
              <div>
                <label className="mb-1 block text-sm text-neutral-400">
                  説明（任意）
                </label>
                <Input
                  value={vaultDescription}
                  onChange={(e) => setVaultDescription(e.target.value)}
                  placeholder="例: Windows PC (自宅)"
                  size="large"
                />
              </div>

              {/* Master password */}
              <div>
                <label className="mb-1 block text-sm text-neutral-400">
                  マスターパスワード
                </label>
                <Input.Password
                  value={vaultMasterPassword}
                  onChange={(e) => setVaultMasterPassword(e.target.value)}
                  placeholder="Vault 解錠用パスワード"
                  size="large"
                  autoComplete="off"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-neutral-400">
                  マスターパスワード（確認）
                </label>
                <Input.Password
                  value={vaultMasterPasswordConfirm}
                  onChange={(e) => setVaultMasterPasswordConfirm(e.target.value)}
                  placeholder="同じパスワードを再入力"
                  size="large"
                  autoComplete="off"
                />
              </div>

              <Button
                type="primary"
                onClick={handleVaultSetup}
                loading={vaultLoading}
                block
              >
                🔐 Vault をセットアップ
              </Button>

              <p className="text-xs text-neutral-500">
                ⚠️ マスターパスワードを忘れると保存済みの認証情報を復元できません。
              </p>
            </div>
          )}

          {/* Case 2: Configured but locked — unlock */}
          {vaultConfigured && !vaultUnlocked && (
            <div className="space-y-4 rounded-lg border border-neutral-700 bg-neutral-800/50 p-4">
              <p className="text-sm font-medium">🔒 Vault はロックされています</p>
              <div>
                <label className="mb-1 block text-sm text-neutral-400">
                  マスターパスワード
                </label>
                <Space.Compact className="w-full">
                  <Input.Password
                    value={vaultCurrentMasterPassword}
                    onChange={(e) => setVaultCurrentMasterPassword(e.target.value)}
                    placeholder="マスターパスワードを入力"
                    size="large"
                    autoComplete="off"
                    className="flex-1"
                    onPressEnter={handleVaultUnlock}
                  />
                  <Button
                    type="primary"
                    size="large"
                    onClick={handleVaultUnlock}
                    loading={vaultLoading}
                  >
                    🔓 解錠
                  </Button>
                </Space.Compact>
              </div>

              <div className="flex justify-end">
                <Button
                  danger
                  size="small"
                  icon={<Trash2 size={14} />}
                  onClick={handleVaultDelete}
                >
                  Vault を削除
                </Button>
              </div>
            </div>
          )}

          {/* Case 3: Configured and unlocked — view/edit credential */}
          {vaultConfigured && vaultUnlocked && (
            <div className="space-y-4 rounded-lg border border-green-700/30 bg-neutral-800/50 p-4">
              {/* Saved credential */}
              <div>
                <p className="mb-3 text-sm font-medium">保存済みクレデンシャル</p>

                <div className="mb-3">
                  <label className="mb-1 block text-sm text-neutral-400">
                    PIN / パスワード
                  </label>
                  <Space.Compact className="w-full">
                    <Input
                      type={vaultShowPin ? 'text' : 'password'}
                      value={vaultPin}
                      onChange={(e) => setVaultPin(e.target.value)}
                      placeholder="1234"
                      size="large"
                      autoComplete="off"
                      className="flex-1"
                    />
                    <Tooltip title={vaultShowPin ? '非表示' : '表示'}>
                      <Button
                        size="large"
                        icon={vaultShowPin ? <EyeOff size={16} /> : <Eye size={16} />}
                        onClick={() => setVaultShowPin(!vaultShowPin)}
                      />
                    </Tooltip>
                  </Space.Compact>
                </div>

                <div className="mb-3">
                  <label className="mb-1 block text-sm text-neutral-400">
                    説明
                  </label>
                  <Input
                    value={vaultDescription}
                    onChange={(e) => setVaultDescription(e.target.value)}
                    placeholder="Windows PC (自宅)"
                    size="large"
                  />
                </div>

                <Space>
                  <Button type="primary" onClick={handleVaultSave} loading={vaultLoading}>
                    保存
                  </Button>
                  <Button onClick={handleVaultLock}>
                    🔒 ロック
                  </Button>
                </Space>
              </div>

              {/* Change master password */}
              <Divider style={{ margin: '12px 0' }} />
              <div>
                <p className="mb-3 text-sm font-medium">マスターパスワード変更</p>
                <div className="mb-2">
                  <Input.Password
                    value={vaultNewMasterPassword}
                    onChange={(e) => setVaultNewMasterPassword(e.target.value)}
                    placeholder="新しいマスターパスワード"
                    size="large"
                    autoComplete="off"
                  />
                </div>
                <div className="mb-2">
                  <Input.Password
                    value={vaultNewMasterPasswordConfirm}
                    onChange={(e) => setVaultNewMasterPasswordConfirm(e.target.value)}
                    placeholder="新しいマスターパスワード（確認）"
                    size="large"
                    autoComplete="off"
                  />
                </div>
                <Space>
                  <Button onClick={handleVaultChangePassword} loading={vaultLoading}>
                    パスワード変更
                  </Button>
                  <Button
                    danger
                    icon={<Trash2 size={14} />}
                    onClick={handleVaultDelete}
                  >
                    Vault を削除
                  </Button>
                </Space>
              </div>

              <p className="text-xs text-neutral-500">
                ⚠️ マスターパスワードを忘れると保存済みの認証情報を復元できません。
              </p>
            </div>
          )}
        </div>

        {/* Model List Auto-Update */}
        <Divider />
        <ModelUpdateSettings ref={modelUpdateRef} onModelsUpdated={loadProviders} />

        {/* Telegram Bot Settings */}
        <Divider />
        <div>
          <h3 className="mb-4 text-lg font-semibold">Telegram Bot設定</h3>
          
          {/* Enable Telegram */}
          <div className="mb-4 flex items-center justify-between">
            <label className="text-sm font-medium">Telegram Bot有効化</label>
            <Switch
              checked={telegramEnabled}
              onChange={(checked) => setTelegramEnabled(checked)}
            />
          </div>

          {/* Bot Token */}
          {telegramEnabled && (
            <>
              <div className="mb-4">
                <label className="mb-2 block text-sm font-medium">Bot Token</label>
                <Input
                  value={telegramToken}
                  onChange={(e) => setTelegramToken(e.target.value)}
                  placeholder="8237820882:AAFD6LgFZdLSZ..."
                  size="large"
                />
                <p className="mt-1 text-xs text-neutral-500">
                  @BotFatherで取得したトークンを入力
                </p>
              </div>

              {/* User ID */}
              <div className="mb-4">
                <label className="mb-2 block text-sm font-medium">許可するUser ID</label>
                <Input
                  value={telegramUserId}
                  onChange={(e) => setTelegramUserId(e.target.value)}
                  placeholder="8555516193"
                  size="large"
                />
                <p className="mt-1 text-xs text-neutral-500">
                  @useinfobot で取得したIDを入力（あなた専用）
                </p>
              </div>

              {/* Gateway Control */}
              <div className="rounded-lg bg-neutral-800 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-medium">Gateway状態</span>
                  <span className={gatewayRunning ? 'text-green-500' : 'text-neutral-500'}>
                    {gatewayRunning ? '●実行中' : '○停止中'}
                  </span>
                </div>
                <Space>
                  {!gatewayRunning ? (
                    <Button type="primary" onClick={handleStartGateway} loading={loading}>
                      🚀 Gateway起動
                    </Button>
                  ) : (
                    <Button danger onClick={handleStopGateway} loading={loading}>
                      ⏹ Gateway停止
                    </Button>
                  )}
                </Space>
                <p className="mt-2 text-xs text-neutral-400">
                  Gateway起動後、Telegramボットにメッセージを送信できます
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <Space>
        <Button type="primary" onClick={handleSave} loading={loading}>
          {t('settings.picoclaw.save')}
        </Button>
        <Button onClick={handleTest} loading={loading}>
          {t('settings.picoclaw.test')}
        </Button>
      </Space>

      {/* Info */}
      <div className="rounded-lg bg-neutral-800 p-4 text-sm">
        <p className="font-medium">{t('settings.picoclaw.infoTitle')}</p>
        <ul className="mt-2 list-inside list-disc space-y-1 text-neutral-400">
          <li>{t('settings.picoclaw.info1')}</li>
          <li>{t('settings.picoclaw.info2')}</li>
          <li>{t('settings.picoclaw.info3')}</li>
        </ul>
      </div>
    </div>
  )
}
