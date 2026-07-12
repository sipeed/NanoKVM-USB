import { ReactElement, useEffect } from 'react'
import clsx from 'clsx'
import { useAtom } from 'jotai'
import { CheckIcon, ZapIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { captureModeAtom } from '@renderer/jotai/device'
import * as storage from '@renderer/libs/storage'

// Experimental (macOS): toggle uncompressed native capture.
export const Capture = (): ReactElement => {
  const { t } = useTranslation()
  const [captureMode, setCaptureMode] = useAtom(captureModeAtom)

  useEffect(() => {
    setCaptureMode(storage.getCaptureMode())
  }, [setCaptureMode])

  function toggle(): void {
    const next = !captureMode
    setCaptureMode(next)
    storage.setCaptureMode(next)
  }

  return (
    <div
      className={clsx(
        'flex h-[30px] cursor-pointer items-center justify-between rounded px-3 hover:bg-neutral-700/50',
        captureMode ? 'text-blue-500' : 'text-neutral-300'
      )}
      onClick={toggle}
    >
      <div className="flex items-center space-x-2">
        <ZapIcon size={16} />
        <span className="text-sm select-none">{t('video.capture')}</span>
      </div>
      {captureMode && <CheckIcon size={14} />}
    </div>
  )
}
