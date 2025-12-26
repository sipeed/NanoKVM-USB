import { ReactElement } from 'react'
import { Popover } from 'antd'
import clsx from 'clsx'
import { useAtom } from 'jotai'
import { EyeOffIcon, HandIcon, MousePointerIcon, PlusIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { mouseStyleAtom } from '@renderer/jotai/mouse'
import * as storage from '@renderer/libs/storage'

export const Style = (): ReactElement => {
  const { t } = useTranslation()
  const [mouseStyle, setMouseStyle] = useAtom(mouseStyleAtom)

  const mouseStyles = [
    {
      name: t('mouse.cursor.pointer'),
      icon: <MousePointerIcon size={14} />,
      value: 'cursor-default'
    },
    { name: t('mouse.cursor.grab'), icon: <HandIcon size={14} />, value: 'cursor-grab' },
    { name: t('mouse.cursor.cell'), icon: <PlusIcon size={14} />, value: 'cursor-cell' },
    { name: t('mouse.cursor.hide'), icon: <EyeOffIcon size={14} />, value: 'cursor-none' }
  ]

  function updateStyle(style: string): void {
    setMouseStyle(style)
    storage.setMouseStyle(style)
  }

  const content = (
    <>
      {mouseStyles.map((style) => (
        <div
          key={style.value}
          className={clsx(
            'flex cursor-pointer items-center space-x-1 rounded py-1.5 pl-3 pr-5 select-none hover:bg-neutral-700/50',
            style.value === mouseStyle ? 'text-blue-500' : 'text-neutral-300'
          )}
          onClick={() => updateStyle(style.value)}
        >
          <div className="flex h-[14px] w-[20px] items-end">{style.icon}</div>
          <span>{style.name}</span>
        </div>
      ))}
    </>
  )

  return (
    <Popover content={content} placement="rightTop" arrow={false} align={{ offset: [13, 0] }}>
      <div className="flex h-[32px] cursor-pointer items-center space-x-2 rounded px-3 text-neutral-300 hover:bg-neutral-700/50">
        <MousePointerIcon size={18} />
        <span className="select-none text-sm">{t('mouse.cursor.title')}</span>
      </div>
    </Popover>
  )
}
