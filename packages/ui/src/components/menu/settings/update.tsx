import { useEffect, useState } from 'react'
import { LoadingOutlined, RocketOutlined, SmileOutlined } from '@ant-design/icons'
import { Button, Divider, Progress, Result, Spin } from 'antd'
import { useTranslation } from 'react-i18next'

import { getPlatform } from '@/services'

type Status = 'loading' | 'latest' | 'outdated' | 'downloading' | 'installing' | 'error'

export const Update = () => {
  const { t } = useTranslation()

  const platform = getPlatform()
  const updater = platform.updater

  const [status, setStatus] = useState<Status>('loading')
  const [currentVersion, setCurrentVersion] = useState('')
  const [latestVersion, setLatestVersion] = useState('')
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    if (!updater) return

    platform.getVersion().then((version) => setCurrentVersion(version))
    updater.check()

    const removeUpdateAvailable = updater.onUpdateAvailable((info) => {
      if (info?.version) {
        setStatus('outdated')
        setLatestVersion(info.version)
      }
    })
    const removeUpdateNotAvailable = updater.onUpdateNotAvailable(() => setStatus('latest'))
    const removeProgress = updater.onProgress((percent) => {
      setProgress(percent)
      if (percent >= 100) {
        setStatus('installing')
      }
    })
    const removeDownloaded = updater.onDownloaded(() => setStatus('installing'))
    const removeError = updater.onError(() => setStatus('error'))

    return () => {
      removeUpdateAvailable()
      removeUpdateNotAvailable()
      removeProgress()
      removeDownloaded()
      removeError()
    }
  }, [platform, updater])

  if (!updater) {
    return null
  }

  function update(): void {
    updater?.download()
    setProgress(0)
    setStatus('downloading')
  }

  return (
    <>
      <div className="text-base font-bold">{t('settings.update.title')}</div>
      <Divider />

      {status === 'loading' && (
        <div className="flex justify-center pt-24">
          <Spin indicator={<LoadingOutlined spin />} size="large" />
        </div>
      )}

      {status === 'latest' && (
        <Result
          status="success"
          icon={<SmileOutlined />}
          title={currentVersion}
          subTitle={t('settings.update.latest')}
        />
      )}

      {status === 'outdated' && (
        <Result
          status="warning"
          icon={<RocketOutlined />}
          title={`${currentVersion} -> ${latestVersion}`}
          subTitle={t('settings.update.outdated')}
          extra={[
            <Button key="update" type="primary" onClick={update}>
              {t('settings.update.confirm')}
            </Button>
          ]}
        />
      )}

      {status === 'downloading' && (
        <div className="flex flex-col items-center justify-center space-y-10 pt-24">
          <Progress
            percent={progress}
            percentPosition={{ align: 'end', type: 'inner' }}
            size={[450, 20]}
          />
          <div />
          <span className="text-blue-500/70">{t('settings.update.downloading')}</span>
        </div>
      )}

      {status === 'installing' && (
        <div className="flex flex-col items-center justify-center space-y-10 pt-24">
          <Spin size="large" />
          <div />
          <span className="text-blue-500/70">{t('settings.update.installing')}</span>
        </div>
      )}

      {status === 'error' && <Result subTitle={t('settings.update.failed')} />}
    </>
  )
}
