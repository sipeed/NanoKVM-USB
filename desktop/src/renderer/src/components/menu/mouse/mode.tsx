import { ReactElement } from 'react'
import { Popover } from 'antd'
import clsx from 'clsx'
import { useAtom } from 'jotai'
import { SquareMousePointerIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { mouseModeAtom } from '@renderer/jotai/mouse'
import * as storage from '@renderer/libs/storage'

export const Mode = (): ReactElement => {
  const { t } = useTranslation()

  const [mouseMode, setMouseMode] = useAtom(mouseModeAtom)

  const mouseModes = [
    { name: t('mouse.absolute'), value: 'absolute' },
    { name: t('mouse.relative'), value: 'relative' }
  ]

  function update(mode: string): void {
    setMouseMode(mode)
    storage.setMouseMode(mode)
  }

  const content = (
    <>
      {mouseModes.map((mode) => (
        <div
          key={mode.value}
          className={clsx(
            'my-1 flex cursor-pointer items-center space-x-1 rounded py-1 pr-5 pl-2 hover:bg-neutral-700/60',
            mode.value === mouseMode ? 'text-blue-500' : 'text-neutral-300'
          )}
          onClick={() => update(mode.value)}
        >
          {mode.name}
        </div>
      ))}
    </>
  )

  return (
    <Popover content={content} placement="rightTop" arrow={false} align={{ offset: [13, 0] }}>
      <div className="flex h-[30px] cursor-pointer items-center space-x-2 rounded px-3 text-neutral-300 hover:bg-neutral-700/50">
        <SquareMousePointerIcon size={16} />
        <span>{t('mouse.mode')}</span>
      </div>
    </Popover>
  )
}
