import { ReactElement, useEffect, useRef, useState } from 'react'
import { Button, Input, message, Select, Space, Tooltip, Switch, Divider } from 'antd'
import { ClipboardIcon, ExternalLinkIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IpcEvents } from '@common/ipc-events'
import { ModelUpdateSettings, ModelUpdateSettingsRef } from './model-update'

interface PicoclawConfig {
  agents?: {
    defaults?: {
      provider?: string
      model?: string
      vision_provider?: string
      vision_model?: string
      max_tokens?: number
    }
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
      'llama-3.2-11b-vision-preview': { label: 'Llama 3.2 11B Vision 👁️', description: 'Vision対応・無料・高速', vision: true },
      'mixtral-8x7b-32768': { label: 'Mixtral 8x7B', description: '中型・バランス' },
      'llama-3.3-70b-versatile': { label: 'Llama 3.3 70B', description: '大型・高品質・トークン消費大' }
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
 * Convert dynamic providers from picoclaw CLI to UI-ready format.
 * Merges with PROVIDER_UI_META for enriched display of known providers/models.
 */
function buildProviderOptions(dynamicProviders: DynamicProvider[]): ProviderOption[] {
  return dynamicProviders.map((dp) => {
    const meta = PROVIDER_UI_META[dp.name]
    // Build model options: start with models from Go, enrich with UI metadata
    const modelOptions = dp.models.map((modelId) => {
      const modelMeta = meta?.models?.[modelId]
      return {
        value: modelId,
        label: modelMeta?.label || modelId,
        description: modelMeta?.description,
        vision: modelMeta?.vision || false
      }
    })
    // Also add any models from UI meta that aren't in Go's list (e.g., manually curated)
    if (meta?.models) {
      for (const [modelId, modelMeta] of Object.entries(meta.models)) {
        if (!dp.models.includes(modelId)) {
          modelOptions.push({
            value: modelId,
            label: modelMeta.label || modelId,
            description: modelMeta.description,
            vision: modelMeta.vision || false
          })
        }
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
 * Vision LLM providers - only providers/models that support image analysis.
 * Used for screen verification (login result, lock screen detection).
 */
const VISION_PROVIDERS = [
  {
    value: 'groq',
    label: 'Groq (無料・クラウド・推奨)',
    defaultModel: 'llama-3.2-11b-vision-preview',
    apiUrl: 'https://console.groq.com/keys',
    models: [
      { value: 'llama-3.2-11b-vision-preview', label: 'Llama 3.2 11B Vision 👁️ (推奨)', description: '無料・高速・クレカ不要' },
      { value: 'llama-3.2-90b-vision-preview', label: 'Llama 3.2 90B Vision 👁️', description: '無料・高品質・低速' }
    ]
  },
  {
    value: 'ollama',
    label: 'Ollama (無料・ローカル)',
    defaultModel: 'moondream2:latest',
    apiUrl: 'https://ollama.ai/download',
    models: [
      { value: 'moondream2:latest', label: 'Moondream2 👁️ (推奨)', description: '1.7B・軽量・CPU向き (~60秒)' },
      { value: 'llava:latest', label: 'LLaVA 👁️', description: '7B・高精度・CPU遅め (~3分)' }
    ]
  },
  {
    value: 'openrouter',
    label: 'OpenRouter',
    defaultModel: 'google/gemini-2.0-flash-001',
    apiUrl: 'https://openrouter.ai/keys',
    models: [
      { value: 'google/gemini-2.0-flash-001', label: 'Gemini 2.0 Flash 👁️', description: '高速・Vision対応・安価' },
      { value: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet 👁️', description: '高品質・高精度' }
    ]
  },
  {
    value: 'openai',
    label: 'OpenAI',
    defaultModel: 'gpt-4o-mini',
    apiUrl: 'https://platform.openai.com/api-keys',
    models: [
      { value: 'gpt-4o-mini', label: 'GPT-4o Mini 👁️', description: '安価・高速' },
      { value: 'gpt-4o', label: 'GPT-4o 👁️', description: '高品質' }
    ]
  },
  {
    value: 'anthropic',
    label: 'Anthropic',
    defaultModel: 'claude-3-5-haiku-20241022',
    apiUrl: 'https://console.anthropic.com/settings/keys',
    models: [
      { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku 👁️', description: '高速・コスト効率' },
      { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet 👁️', description: '高品質' }
    ]
  }
]

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

  useEffect(() => {
    loadProviders()
    loadConfig()
    loadGatewayStatus()
    loadVersion()
  }, [])

  async function loadProviders(): Promise<void> {
    try {
      const result = await window.electron.ipcRenderer.invoke(IpcEvents.PICOCLAW_GET_PROVIDERS)
      if (result.success && result.providers?.length > 0) {
        const dynamicProviders = buildProviderOptions(result.providers as DynamicProvider[])
        setProviders(dynamicProviders)
        console.log(`[Picoclaw] Loaded ${dynamicProviders.length} providers dynamically`)
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
        setModel(result.config.agents?.defaults?.model || '')
        
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
        message.error('GitHub認証が必要です。ターミナルで `gh auth login` を実行してください。')
        return
      }
    } else if (!apiKey && requiresApiKey(provider)) {
      message.error(t('settings.picoclaw.apiKeyRequired'))
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
      if (visionProvider && visionProvider !== provider && requiresApiKey(visionProvider)) {
        providersUpdate[visionProvider] = {
          api_key: visionApiKey,
          api_base: config.providers?.[visionProvider]?.api_base || ''
        }
      }

      const updates: PicoclawConfig = {
        agents: {
          defaults: {
            ...config.agents?.defaults,
            provider,
            model: model || providers.find((p) => p.value === provider)?.defaultModel || '',
            // Groq free tier has very low TPM (6000); reduce max_tokens to avoid hitting limit
            ...(provider === 'groq' && { max_tokens: 1024 }),
            vision_provider: visionProvider || undefined,
            vision_model: visionModel || undefined
          }
        },
        providers: providersUpdate,
        channels: {
          ...config.channels,
          telegram: {
            enabled: telegramEnabled,
            token: telegramToken,
            proxy: '',
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

    // Check if this provider+model exists in VISION_PROVIDERS
    const vp = VISION_PROVIDERS.find((p) => p.value === chatProvider)
    if (vp) {
      const vm = vp.models.find((m) => m.value === chatModel)
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
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
                  <span className="text-sm text-red-400">GitHub 認証が必要です</span>
                </div>
                <p className="text-xs text-neutral-500">
                  ターミナルで <code className="rounded bg-neutral-700 px-1">gh auth login</code> を実行してください。
                </p>
                <Button
                  size="small"
                  onClick={detectGitHubAuth}
                >
                  再検出
                </Button>
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
                const vp = VISION_PROVIDERS.find((p) => p.value === value)
                setVisionModel(vp?.defaultModel || '')
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
              options={VISION_PROVIDERS.map((vp) => ({ value: vp.value, label: vp.label }))}
            />
            <p className="mt-1 text-xs text-neutral-500">
              無料推奨: Groq（クレカ不要）またはOllama（ローカル）
            </p>
          </div>

          {/* Vision API Key (only if different provider and not ollama) */}
          {visionProvider && requiresApiKey(visionProvider) && visionProvider !== provider && (
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
                  VISION_PROVIDERS.find((p) => p.value === visionProvider)?.models?.map((m) => ({
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
        <ModelUpdateSettings ref={modelUpdateRef} />

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
