import { ReactElement, useEffect } from 'react'
import { Popover } from 'antd'
import clsx from 'clsx'
import { useAtom } from 'jotai'
import { MousePointerClickIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { autoClickerModeAtom } from '@renderer/jotai/mouse'
import { getAutoClickerMode, setAutoClickerMode } from '@renderer/libs/storage'
import { startAutoClicker, stopAutoClicker } from '@renderer/libs/auto-clicker'

export const AutoClicker = (): ReactElement => {
  const { t } = useTranslation()
  const [autoClickerMode, setAutoClickerModeState] = useAtom(autoClickerModeAtom)

  const autoClickerModes: { name: string; value: 'enable' | 'disable' }[] = [
    { name: t('mouse.autoClicker.enable'), value: 'enable' },
    { name: t('mouse.autoClicker.disable'), value: 'disable' }
  ]

  function update(mode: 'enable' | 'disable'): void {
    setAutoClickerMode(mode)
    setAutoClickerModeState(mode)

    if (mode === 'enable') {
      startAutoClicker()
    } else {
      stopAutoClicker()
    }
  }

  useEffect(() => {
    const mode = getAutoClickerMode()
    setAutoClickerModeState(mode)

    if (mode === 'enable') {
      startAutoClicker()
    }

    return () => {
      stopAutoClicker()
    }
  }, [])

  const content = (
    <>
      {autoClickerModes.map((mode) => (
        <div
          key={mode.value}
          className={clsx(
            'my-1 flex cursor-pointer items-center space-x-1 rounded py-1 pr-5 pl-2 hover:bg-neutral-700/50',
            mode.value === autoClickerMode ? 'text-blue-500' : 'text-neutral-300'
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
        <MousePointerClickIcon size={16} />
        <span>{t('mouse.autoClicker.title')}</span>
      </div>
    </Popover>
  )
}
