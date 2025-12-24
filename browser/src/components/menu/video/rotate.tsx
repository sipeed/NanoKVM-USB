import { ReactElement } from 'react'
import { Popover } from 'antd'
import { useAtom } from 'jotai'
import { RotateCcwIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { videoRotateAtom } from '@/jotai/device.ts';
import * as storage from '@/libs/storage';
import clsx from 'clsx';

export const Rotate = (): ReactElement => {
  const { t } = useTranslation()
  const rotates = new Map([
      ["0", t('video.noRotation')],
      ["90", "90°"],
      ["180", "180°"],
      ["270", "270°"]
  ]);

  const [videoRotate, setVideoRotate] = useAtom(videoRotateAtom)

  async function updateRotate(rotate: number): Promise<void> {
    setVideoRotate(rotate)
    storage.setVideoRotate(rotate)
  }

  const content = (
    <>
      {Array.from(rotates).map(([degree, label]) => (
        <div
          key={degree}
          className={clsx(
            'flex cursor-pointer select-none items-center space-x-1 rounded px-3 py-1.5 hover:bg-neutral-700/60',
            videoRotate === parseInt(degree) ? 'text-blue-500' : 'text-white')}
          onClick={() => updateRotate(parseInt(degree))}
        >
          <span>{label}</span>
        </div>
      ))}
    </>
  )

  return (
    <Popover content={content} placement="rightTop" arrow={false} align={{ offset: [13, 0] }}>
      <div className="flex h-[30px] cursor-pointer items-center space-x-1 rounded px-3 text-neutral-300 hover:bg-neutral-700/50">
        <div className="flex h-[14px] w-[20px] items-end">
          <RotateCcwIcon size={16} />
        </div>
        <span>{t('video.rotate')}</span>
      </div>
    </Popover>
  )
}
