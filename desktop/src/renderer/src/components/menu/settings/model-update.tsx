import { ReactElement, useEffect, useState } from 'react'
import { Button, message, Select, Switch, Space } from 'antd'
import { RefreshCwIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IpcEvents } from '@common/ipc-events'

interface ModelUpdateSchedule {
  frequency: 'daily' | 'weekly' | 'monthly'
  hour: number
  dayOfWeek?: number
  dayOfMonth?: number
  enabled: boolean
}

interface ModelUpdateStatus {
  lastChecked?: string
  nextCheck?: string
  lastUpdatedModels?: string[]
  autoSwitched?: boolean
  autoSwitchDetails?: string
}

export const ModelUpdateSettings = (): ReactElement => {
  const { t } = useTranslation()

  const [loading, setLoading] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [enabled, setEnabled] = useState(true)
  const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'monthly'>('monthly')
  const [hour, setHour] = useState(0)
  const [dayOfWeek, setDayOfWeek] = useState(1) // Monday
  const [dayOfMonth, setDayOfMonth] = useState(1)
  const [status, setStatus] = useState<ModelUpdateStatus>({})

  useEffect(() => {
    loadSchedule()
    loadStatus()
  }, [])

  async function loadSchedule(): Promise<void> {
    try {
      const result = await window.electron.ipcRenderer.invoke(
        IpcEvents.PICOCLAW_GET_MODEL_UPDATE_SCHEDULE
      )
      if (result.success && result.schedule) {
        const s = result.schedule as ModelUpdateSchedule
        setEnabled(s.enabled)
        setFrequency(s.frequency)
        setHour(s.hour)
        if (s.dayOfWeek !== undefined) setDayOfWeek(s.dayOfWeek)
        if (s.dayOfMonth !== undefined) setDayOfMonth(s.dayOfMonth)
      }
    } catch (err) {
      console.error('Failed to load model update schedule:', err)
    }
  }

  async function loadStatus(): Promise<void> {
    try {
      const result = await window.electron.ipcRenderer.invoke(
        IpcEvents.PICOCLAW_GET_MODEL_UPDATE_STATUS
      )
      if (result.success && result.status) {
        setStatus(result.status)
      }
    } catch (err) {
      console.error('Failed to load model update status:', err)
    }
  }

  async function handleSave(): Promise<void> {
    setLoading(true)
    try {
      const schedule: ModelUpdateSchedule = {
        frequency,
        hour,
        dayOfWeek: frequency === 'weekly' ? dayOfWeek : undefined,
        dayOfMonth: frequency === 'monthly' ? dayOfMonth : undefined,
        enabled
      }

      const result = await window.electron.ipcRenderer.invoke(
        IpcEvents.PICOCLAW_SET_MODEL_UPDATE_SCHEDULE,
        schedule
      )

      if (result.success) {
        message.success(t('settings.picoclaw.modelUpdate.saved'))
        await loadStatus()
      } else {
        message.error(result.error || 'Failed to save schedule')
      }
    } catch (err) {
      console.error('Failed to save schedule:', err)
      message.error(String(err))
    } finally {
      setLoading(false)
    }
  }

  async function handleUpdateNow(): Promise<void> {
    setUpdating(true)
    try {
      const result = await window.electron.ipcRenderer.invoke(IpcEvents.PICOCLAW_UPDATE_MODELS_NOW)

      if (result.success) {
        if (result.autoSwitched) {
          message.warning(
            `${t('settings.picoclaw.modelUpdate.autoSwitched')}: ${result.autoSwitchDetails}`,
            8
          )
        } else {
          const providerSummary = result.providers
            ?.map(
              (p: { provider: string; modelCount: number; error?: string }) =>
                p.error ? `${p.provider}: ❌ ${p.error}` : `${p.provider}: ${p.modelCount}`
            )
            .join(', ')
          message.success(
            `${t('settings.picoclaw.modelUpdate.updateSuccess')} (${providerSummary})`
          )
        }
        await loadStatus()
      } else {
        message.error(result.error || t('settings.picoclaw.modelUpdate.updateFailed'))
      }
    } catch (err) {
      console.error('Failed to update models:', err)
      message.error(t('settings.picoclaw.modelUpdate.updateFailed'))
    } finally {
      setUpdating(false)
    }
  }

  function formatDateTime(isoString?: string): string {
    if (!isoString) return t('settings.picoclaw.modelUpdate.never')
    try {
      const date = new Date(isoString)
      return date.toLocaleString()
    } catch {
      return isoString
    }
  }

  const hourOptions = Array.from({ length: 24 }, (_, i) => ({
    value: i,
    label: `${i.toString().padStart(2, '0')}:00`
  }))

  const dayOfWeekOptions = [
    { value: 0, label: t('settings.picoclaw.modelUpdate.sunday') },
    { value: 1, label: t('settings.picoclaw.modelUpdate.monday') },
    { value: 2, label: t('settings.picoclaw.modelUpdate.tuesday') },
    { value: 3, label: t('settings.picoclaw.modelUpdate.wednesday') },
    { value: 4, label: t('settings.picoclaw.modelUpdate.thursday') },
    { value: 5, label: t('settings.picoclaw.modelUpdate.friday') },
    { value: 6, label: t('settings.picoclaw.modelUpdate.saturday') }
  ]

  const dayOfMonthOptions = Array.from({ length: 28 }, (_, i) => ({
    value: i + 1,
    label: `${i + 1}`
  }))

  return (
    <div className="space-y-4">
      <div>
        <h3 className="mb-1 text-lg font-semibold">
          🔄 {t('settings.picoclaw.modelUpdate.title')}
        </h3>
        <p className="mb-4 text-xs text-neutral-400">
          {t('settings.picoclaw.modelUpdate.description')}
        </p>
      </div>

      {/* Enable toggle */}
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">
          {t('settings.picoclaw.modelUpdate.enabled')}
        </label>
        <Switch checked={enabled} onChange={(checked) => setEnabled(checked)} />
      </div>

      {enabled && (
        <>
          {/* Frequency */}
          <div>
            <label className="mb-2 block text-sm font-medium">
              {t('settings.picoclaw.modelUpdate.frequency')}
            </label>
            <Select
              value={frequency}
              onChange={(value) => setFrequency(value)}
              className="w-full"
              size="large"
              options={[
                {
                  value: 'daily',
                  label: t('settings.picoclaw.modelUpdate.daily')
                },
                {
                  value: 'weekly',
                  label: t('settings.picoclaw.modelUpdate.weekly')
                },
                {
                  value: 'monthly',
                  label: t('settings.picoclaw.modelUpdate.monthly')
                }
              ]}
            />
          </div>

          {/* Day of week (for weekly) */}
          {frequency === 'weekly' && (
            <div>
              <label className="mb-2 block text-sm font-medium">
                {t('settings.picoclaw.modelUpdate.dayOfWeek')}
              </label>
              <Select
                value={dayOfWeek}
                onChange={(value) => setDayOfWeek(value)}
                className="w-full"
                size="large"
                options={dayOfWeekOptions}
              />
            </div>
          )}

          {/* Day of month (for monthly) */}
          {frequency === 'monthly' && (
            <div>
              <label className="mb-2 block text-sm font-medium">
                {t('settings.picoclaw.modelUpdate.dayOfMonth')}
              </label>
              <Select
                value={dayOfMonth}
                onChange={(value) => setDayOfMonth(value)}
                className="w-full"
                size="large"
                options={dayOfMonthOptions}
              />
            </div>
          )}

          {/* Hour */}
          <div>
            <label className="mb-2 block text-sm font-medium">
              {t('settings.picoclaw.modelUpdate.hour')}
            </label>
            <Select
              value={hour}
              onChange={(value) => setHour(value)}
              className="w-full"
              size="large"
              options={hourOptions}
            />
          </div>
        </>
      )}

      {/* Save + Update Now buttons */}
      <Space>
        <Button type="primary" onClick={handleSave} loading={loading}>
          {t('settings.picoclaw.save')}
        </Button>
        <Button
          icon={<RefreshCwIcon size={14} />}
          onClick={handleUpdateNow}
          loading={updating}
        >
          {updating
            ? t('settings.picoclaw.modelUpdate.updating')
            : t('settings.picoclaw.modelUpdate.updateNow')}
        </Button>
      </Space>

      {/* Status display */}
      <div className="rounded-lg bg-neutral-800 p-3 text-sm">
        <div className="flex justify-between text-neutral-400">
          <span>{t('settings.picoclaw.modelUpdate.lastChecked')}:</span>
          <span>{formatDateTime(status.lastChecked)}</span>
        </div>
        <div className="mt-1 flex justify-between text-neutral-400">
          <span>{t('settings.picoclaw.modelUpdate.nextCheck')}:</span>
          <span>{formatDateTime(status.nextCheck)}</span>
        </div>
        {status.lastUpdatedModels && status.lastUpdatedModels.length > 0 && (
          <div className="mt-2 border-t border-neutral-700 pt-2">
            {status.lastUpdatedModels.map((info, i) => (
              <div key={i} className="text-xs text-neutral-500">
                {info}
              </div>
            ))}
          </div>
        )}
        {status.autoSwitched && status.autoSwitchDetails && (
          <div className="mt-2 border-t border-neutral-700 pt-2 text-xs text-yellow-500">
            ⚠️ {status.autoSwitchDetails}
          </div>
        )}
      </div>
    </div>
  )
}
