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
    <div className="flex h-[30px] cursor-pointer items-center justify-between space-x-2 rounded px-3 text-neutral-300 hover:bg-neutral-700/50">
      <span>{t('keyboard.ignoreCapsLock')}</span>
      <Switch size="small" checked={ignoreCapsLock} onChange={handleIgnoreCapsLockChange} />
    </div>
  )
}
