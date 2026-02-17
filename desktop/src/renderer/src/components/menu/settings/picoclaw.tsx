import { ReactElement, useEffect, useState } from 'react'
import { Button, Input, message, Select, Space, Tooltip } from 'antd'
import { ClipboardIcon, ExternalLinkIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IpcEvents } from '@common/ipc-events'

interface PicoclawConfig {
  agents?: {
    defaults?: {
      provider?: string
      model?: string
    }
  }
  providers?: {
    [key: string]: {
      api_key?: string
      api_base?: string
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
      { value: 'meta-llama/llama-3.1-8b-instruct', label: 'Llama 3.1 8B 💨 (推奨・無料枠)', description: '軽量・高速・トークン節約' },
      { value: 'google/gemini-pro-1.5', label: 'Gemini Pro 1.5 (無料枠)', description: '中型・バランス' },
      { value: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet', description: '大型・高品質' }
    ]
  },
  {
    value: 'anthropic',
    label: 'Anthropic',
    defaultModel: 'claude-3-5-haiku-20241022',
    apiUrl: 'https://console.anthropic.com/settings/keys',
    models: [
      { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku 💨 (推奨)', description: '軽量・高速・コスト効率' },
      { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet', description: '大型・高品質' }
    ]
  },
  {
    value: 'openai',
    label: 'OpenAI',
    defaultModel: 'gpt-4o-mini',
    apiUrl: 'https://platform.openai.com/api-keys',
    models: [
      { value: 'gpt-4o-mini', label: 'GPT-4o Mini 💨 (推奨)', description: '軽量・高速・コスト効率' },
      { value: 'gpt-4o', label: 'GPT-4o', description: '大型・高品質' }
    ]
  },
  {
    value: 'deepseek',
    label: 'DeepSeek',
    defaultModel: 'deepseek-chat',
    apiUrl: 'https://platform.deepseek.com/api_keys',
    models: [
      { value: 'deepseek-chat', label: 'DeepSeek Chat (推奨)', description: '標準モデル・安価' },
      { value: 'deepseek-coder', label: 'DeepSeek Coder', description: 'コーディング特化' }
    ]
  },
  {
    value: 'groq',
    label: 'Groq',
    defaultModel: 'llama-3.1-8b-instant',
    apiUrl: 'https://console.groq.com/keys',
    models: [
      { value: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant 💨 (推奨)', description: '軽量・超高速・トークン節約' },
      { value: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B', description: '中型・バランス' },
      { value: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B', description: '大型・高品質・トークン消費大' }
    ]
  },
  {
    value: 'ollama',
    label: 'Ollama (Local)',
    defaultModel: 'llama3.2:1b',
    apiUrl: 'https://ollama.ai/download',
    models: [
      { value: 'llama3.2:1b', label: 'Llama 3.2 1B 💨 (推奨)', description: '超軽量・高速・CPU向き' },
      { value: 'llama3.2:latest', label: 'Llama 3.2 3B', description: '標準・バランス' },
      { value: 'qwen2.5:latest', label: 'Qwen 2.5', description: '多言語対応' }
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

  useEffect(() => {
    loadConfig()
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
      }
    } catch (err) {
      console.error('Failed to load picoclaw config:', err)
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
      const updates: PicoclawConfig = {
        agents: {
          defaults: {
            ...config.agents?.defaults,
            provider,
            model: model || PROVIDERS.find((p) => p.value === provider)?.defaultModel || ''
          }
        },
        providers: {
          ...config.providers,
          [provider]: {
            api_key: apiKey,
            api_base: config.providers?.[provider]?.api_base || ''
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
        <h2 className="text-xl font-semibold">{t('settings.picoclaw.title')}</h2>
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
            onChange={(value) => setModel(value)}
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
