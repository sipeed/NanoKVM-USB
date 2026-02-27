import { ReactElement } from 'react'
import { Popover } from 'antd'
import clsx from 'clsx'
import { useAtom } from 'jotai'
import { MonitorDotIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { maxResolutionModeAtom } from '@renderer/jotai/device'
import { camera } from '@renderer/libs/media/camera'
import * as storage from '@renderer/libs/storage'

export const MaxResolution = (): ReactElement => {
  const { t } = useTranslation()
  const [maxResolutionMode, setMaxResolutionMode] = useAtom(maxResolutionModeAtom)

  const modeList = [
    { label: t('video.maxResolution.mode1440p30'), value: '1440p30' as const },
    { label: t('video.maxResolution.mode1080p60'), value: '1080p60' as const }
  ]

  async function handleChange(value: '1440p30' | '1080p60'): Promise<void> {
    setMaxResolutionMode(value)
    storage.setMaxResolutionMode(value)
    
    // Re-open camera with new mode if already connected
    if (camera.isOpen()) {
      try {
        const currentId = camera.id
        const currentAudioId = camera.audioId
        const currentWidth = camera.width
        const currentHeight = camera.height
        
        await camera.open(currentId, currentWidth, currentHeight, currentAudioId, value)
        
        const video = document.getElementById('video') as HTMLVideoElement
        if (video) {
          video.srcObject = camera.getStream()
        }
      } catch (err) {
        console.error('[MaxResolution] Failed to update mode:', err)
      }
    }
  }

  const content = (
    <>
      {modeList.map((item) => (
        <div
          key={item.value}
          className={clsx(
            'flex cursor-pointer items-center rounded px-5 py-1.5 select-none hover:bg-neutral-700/60',
            item.value === maxResolutionMode ? 'text-blue-500' : 'text-white'
          )}
          onClick={() => handleChange(item.value)}
        >
          <span>{item.label}</span>
        </div>
      ))}
    </>
  )

  return (
    <Popover content={content} placement="rightTop" arrow={false} align={{ offset: [13, 0] }}>
      <div className="flex h-[30px] cursor-pointer items-center space-x-2 rounded px-3 text-neutral-300 hover:bg-neutral-700/50">
        <MonitorDotIcon size={16} />
        <span>{t('video.maxResolution.title')}</span>
      </div>
    </Popover>
  )
}
