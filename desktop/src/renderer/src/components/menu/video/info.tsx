import { ReactElement, useEffect, useState } from 'react'
import { Popover } from 'antd'
import { InfoIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export const Info = (): ReactElement => {
  const { t } = useTranslation()

  const [videoInfo, setVideoInfo] = useState({
    requestedWidth: 0,
    requestedHeight: 0,
    displayWidth: 0,
    displayHeight: 0,
    scale: 0
  })

  useEffect(() => {
    const updateVideoInfo = (): void => {
      const video = document.getElementById('video') as HTMLVideoElement
      if (!video) return

      const rect = video.getBoundingClientRect()
      const scale =
        video.videoWidth > 0 ? Math.round((rect.width / video.videoWidth) * 100) : 0

      setVideoInfo({
        requestedWidth: video.videoWidth,
        requestedHeight: video.videoHeight,
        displayWidth: Math.round(rect.width),
        displayHeight: Math.round(rect.height),
        scale
      })
    }

    // Initial update
    updateVideoInfo()

    // Update every second to reflect window resize
    const interval = setInterval(updateVideoInfo, 1000)

    // Update on window resize
    window.addEventListener('resize', updateVideoInfo)

    return () => {
      clearInterval(interval)
      window.removeEventListener('resize', updateVideoInfo)
    }
  }, [])

  const content = (
    <div className="flex flex-col space-y-2 px-2 py-1">
      <div className="flex items-center justify-between space-x-8">
        <span className="text-sm text-neutral-400">{t('video.info.capturedResolution')}</span>
        <span className="text-sm text-white">
          {videoInfo.requestedWidth} x {videoInfo.requestedHeight}
        </span>
      </div>

      <div className="flex items-center justify-between space-x-8">
        <span className="text-sm text-neutral-400">{t('video.info.displayResolution')}</span>
        <span className="text-sm text-white">
          {videoInfo.displayWidth} x {videoInfo.displayHeight}
        </span>
      </div>

      <div className="flex items-center justify-between space-x-8">
        <span className="text-sm text-neutral-400">{t('video.info.displayScale')}</span>
        <span className="text-sm text-white">{videoInfo.scale}%</span>
      </div>
    </div>
  )

  return (
    <Popover content={content} placement="rightTop" arrow={false} align={{ offset: [13, 0] }}>
      <div className="flex h-[30px] cursor-pointer items-center space-x-2 rounded px-3 text-neutral-300 hover:bg-neutral-700/50">
        <InfoIcon size={16} />
        <span className="text-sm select-none">{t('video.info.title')}</span>
      </div>
    </Popover>
  )
}
