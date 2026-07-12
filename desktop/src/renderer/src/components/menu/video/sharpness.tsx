import { ReactElement } from 'react'
import { Popover, Slider } from 'antd'
import { useAtom, useAtomValue } from 'jotai'
import { WandSparklesIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { captureModeAtom, sharpnessAtom } from '@renderer/jotai/device'
import { captureCamera } from '@renderer/libs/capture/capture-camera'
import * as storage from '@renderer/libs/storage'

// Sharpening strength (contrast-adaptive) for the uncompressed capture canvas.
export const Sharpness = (): ReactElement | null => {
  const { t } = useTranslation()
  const captureMode = useAtomValue(captureModeAtom)
  const [sharpness, setSharpness] = useAtom(sharpnessAtom)

  if (!captureMode) return null

  function update(value: number): void {
    const v = value / 100
    setSharpness(v)
    storage.setSharpness(v)
    captureCamera.setSharpness(v)
  }

  const content = (
    <div className="w-[180px] px-2">
      <Slider min={0} max={100} value={Math.round(sharpness * 100)} onChange={update} />
    </div>
  )

  return (
    <Popover content={content} placement="rightTop" arrow={false} align={{ offset: [13, 0] }}>
      <div className="flex h-[30px] cursor-pointer items-center space-x-2 rounded px-3 text-neutral-300 hover:bg-neutral-700/50">
        <WandSparklesIcon size={16} />
        <span className="text-sm select-none">{t('video.sharpness')}</span>
      </div>
    </Popover>
  )
}
