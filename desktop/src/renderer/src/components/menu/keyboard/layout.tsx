import { ReactElement } from 'react'
import { Select } from 'antd'
import { useAtom } from 'jotai'
import { KeyboardIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { keyboardLayoutAtom } from '@renderer/jotai/keyboard'
import type { KeyboardLayout } from '@renderer/libs/keyboard/layout'
import { KEYBOARD_LAYOUTS } from '@renderer/libs/keyboard/layout'
import { setKeyboardLayout } from '@renderer/libs/storage'

export const KeyboardLayoutSelect = (): ReactElement => {
  const { t } = useTranslation()
  const [keyboardLayout, setKeyboardLayoutState] = useAtom(keyboardLayoutAtom)

  function changeKeyboardLayout(layout: KeyboardLayout): void {
    setKeyboardLayout(layout)
    setKeyboardLayoutState(layout)
  }

  const options = KEYBOARD_LAYOUTS.map((layout) => ({
    value: layout,
    label: layout === 'de' ? t('keyboard.layoutDe') : t('keyboard.layoutUs')
  }))

  return (
    <div className="flex h-[30px] items-center justify-between space-x-3 rounded px-3 text-neutral-300">
      <div className="flex items-center space-x-2">
        <KeyboardIcon size={16} />
        <span>{t('keyboard.layout')}</span>
      </div>

      <Select<KeyboardLayout>
        size="small"
        className="w-[104px]"
        value={keyboardLayout}
        options={options}
        onChange={changeKeyboardLayout}
        onClick={(event) => event.stopPropagation()}
      />
    </div>
  )
}
