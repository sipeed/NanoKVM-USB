import { ReactElement } from 'react'
import { Switch } from 'antd'
import { useAtom } from 'jotai'
import { useTranslation } from 'react-i18next'

import { capsLockSyncAtom } from '@renderer/jotai/keyboard'
import { setCapsLockSync as saveCapsLockSync } from '@renderer/libs/storage'

export const CapsLockSync = (): ReactElement => {
  const { t } = useTranslation()
  const [capsLockSync, setCapsLockSync] = useAtom(capsLockSyncAtom)

  function handleCapsLockSyncChange(checked: boolean): void {
    setCapsLockSync(checked)
    saveCapsLockSync(checked)
  }

  return (
    <div className="flex h-[30px] items-center justify-between space-x-2 rounded px-3 text-neutral-300">
      <span>{t('keyboard.capsLockSync')}</span>
      <Switch size="small" checked={capsLockSync} onChange={handleCapsLockSyncChange} />
    </div>
  )
}
