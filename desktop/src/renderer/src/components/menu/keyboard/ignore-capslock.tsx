import { Switch } from 'antd'
import { useAtom } from 'jotai'
import { useTranslation } from 'react-i18next'

import { ignoreCapsLockAtom } from '@renderer/jotai/keyboard'
import { saveIgnoreCapsLock } from '@renderer/libs/storage'

export const IgnoreCapsLock = () => {
  const { t } = useTranslation()
  const [ignoreCapsLock, setIgnoreCapsLock] = useAtom(ignoreCapsLockAtom)

  const handleIgnoreCapsLockChange = (checked: boolean) => {
    setIgnoreCapsLock(checked)
    saveIgnoreCapsLock(checked)
  }

  return (
    <div className="flex cursor-pointer items-center justify-between px-3 py-2 hover:bg-neutral-100">
      <span className="text-sm">{t('keyboard.ignoreCapsLock')}</span>
      <Switch size="small" checked={ignoreCapsLock} onChange={handleIgnoreCapsLockChange} />
    </div>
  )
}
