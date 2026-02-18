import { ReactElement, useEffect, useState } from 'react'
import { Button, Input, message, Select, Space, Tooltip, Switch, Divider } from 'antd'
import { ClipboardIcon, ExternalLinkIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IpcEvents } from '@common/ipc-events'

interface PicoclawConfig {
  agents?: {
    defaults?: {
      provider?: string
      model?: string
      vision_provider?: string
      vision_model?: string
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

const PROVIDERS = [
  {
    value: 'openrouter',
    label: 'OpenRouter',
    defaultModel: 'meta-llama/llama-3.1-8b-instruct',
    apiUrl: 'https://openrouter.ai/keys',
    models: [
      { value: 'meta-llama/llama-3.1-8b-instruct', label: 'Llama 3.1 8B 💨 (推奨・無料枠)', description: '軽量・高速・トークン節約', vision: false },
      { value: 'google/gemini-2.0-flash-001', label: 'Gemini 2.0 Flash 👁️ (Vision対応)', description: '高速・Vision対応・安価', vision: true },
      { value: 'google/gemini-pro-1.5', label: 'Gemini Pro 1.5 (無料枠)', description: '中型・バランス', vision: false },
      { value: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet 👁️', description: '大型・高品質・Vision対応', vision: true }
    ]
  },
  {
    value: 'anthropic',
    label: 'Anthropic',
    defaultModel: 'claude-3-5-haiku-20241022',
    apiUrl: 'https://console.anthropic.com/settings/keys',
    models: [
      { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku 💨 (推奨)', description: '軽量・高速・コスト効率', vision: true },
      { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet 👁️', description: '大型・高品質・Vision対応', vision: true }
    ]
  },
  {
    value: 'openai',
    label: 'OpenAI',
    defaultModel: 'gpt-4o-mini',
    apiUrl: 'https://platform.openai.com/api-keys',
    models: [
      { value: 'gpt-4o-mini', label: 'GPT-4o Mini 💨👁️ (推奨)', description: '軽量・高速・Vision対応', vision: true },
      { value: 'gpt-4o', label: 'GPT-4o 👁️', description: '大型・高品質・Vision対応', vision: true }
    ]
  },
  {
    value: 'deepseek',
    label: 'DeepSeek',
    defaultModel: 'deepseek-chat',
    apiUrl: 'https://platform.deepseek.com/api_keys',
    models: [
      { value: 'deepseek-chat', label: 'DeepSeek Chat (推奨)', description: '標準モデル・安価', vision: false },
      { value: 'deepseek-coder', label: 'DeepSeek Coder', description: 'コーディング特化', vision: false }
    ]
  },
  {
    value: 'groq',
    label: 'Groq',
    defaultModel: 'llama-3.1-8b-instant',
    apiUrl: 'https://console.groq.com/keys',
    models: [
      { value: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant 💨 (推奨)', description: '軽量・超高速・トークン節約', vision: false },
      { value: 'llama-3.2-11b-vision-preview', label: 'Llama 3.2 11B Vision 👁️', description: 'Vision対応・無料・高速', vision: true },
      { value: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B', description: '中型・バランス', vision: false },
      { value: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B', description: '大型・高品質・トークン消費大', vision: false }
    ]
  },
  {
    value: 'ollama',
    label: 'Ollama (Local)',
    defaultModel: 'llama3.2:1b',
    apiUrl: 'https://ollama.ai/download',
    models: [
      { value: 'llama3.2:1b', label: 'Llama 3.2 1B 💨 (推奨)', description: '超軽量・高速・CPU向き', vision: false },
      { value: 'llama3.2:latest', label: 'Llama 3.2 3B', description: '標準・バランス', vision: false },
      { value: 'moondream2:latest', label: 'Moondream2 👁️ (軽量Vision)', description: 'Vision対応・1.7B・CPU向き', vision: true },
      { value: 'llava:latest', label: 'LLaVA 👁️', description: 'Vision対応・7B・ローカル', vision: true },
      { value: 'qwen2.5:latest', label: 'Qwen 2.5', description: '多言語対応', vision: false }
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

  useEffect(() => {
    loadConfig()
    loadGatewayStatus()
    loadVersion()
  }, [])

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
    if (!apiKey && provider !== 'ollama') {
      message.error(t('settings.picoclaw.apiKeyRequired'))
      return
    }

    setLoading(true)
    try {
      // Update config
      const providersUpdate: Record<string, { api_key?: string; api_base?: string }> = {
        ...config.providers,
        [provider]: {
          api_key: apiKey,
          api_base: config.providers?.[provider]?.api_base || ''
        }
      }

      // Save Vision provider API key if it's a different provider
      if (visionProvider && visionProvider !== provider && visionProvider !== 'ollama') {
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
            model: model || PROVIDERS.find((p) => p.value === provider)?.defaultModel || '',
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
        message.success(t('settings.picoclaw.saved'))
        await loadConfig()
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
    if (!apiKey && provider !== 'ollama') {
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
    const providerData = PROVIDERS.find((p) => p.value === chatProvider)
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
    const defaultModel = PROVIDERS.find((p) => p.value === value)?.defaultModel || ''
    setModel(defaultModel)

    // Auto-sync Vision if the default model is Vision-capable
    syncVisionIfCapable(value, defaultModel)
  }

  async function openApiKeyPage(): Promise<void> {
    const currentProvider = PROVIDERS.find((p) => p.value === provider)
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
            options={PROVIDERS}
            size="large"
          />
        </div>

        {/* API Key */}
        {provider !== 'ollama' && (
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
            placeholder={PROVIDERS.find((p) => p.value === provider)?.defaultModel}
            size="large"
            className="w-full"
            options={
              PROVIDERS.find((p) => p.value === provider)?.models?.map((m) => ({
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
          {visionProvider && visionProvider !== 'ollama' && visionProvider !== provider && (
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
