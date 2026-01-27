import { useAtom } from 'jotai'
import { Switch } from 'antd'
import { useTranslation } from 'react-i18next'
import { commandToCtrlAtom } from '@renderer/jotai/keyboard'
import { setCommandToCtrl as saveCommandToCtrl } from '@renderer/libs/storage'
import type { MenuItemType } from '@renderer/types'

export const CommandToCtrl = () => {
  const { t } = useTranslation()
  const [commandToCtrl, setCommandToCtrl] = useAtom(commandToCtrlAtom)

  const handleCommandToCtrlChange = (checked: boolean) => {
    setCommandToCtrl(checked)
    saveCommandToCtrl(checked)
  }

  return (
    <div className="menu-item">
      <span>{t('keyboard.commandToCtrl')}</span>
      <Switch size="small" checked={commandToCtrl} onChange={handleCommandToCtrlChange} />
    </div>
  )
}

CommandToCtrl.type = 'item' as MenuItemType