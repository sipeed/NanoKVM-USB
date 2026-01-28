import { useAtom } from 'jotai'
import { Switch } from 'antd'
import { useTranslation } from 'react-i18next'
import { commandToCtrlAtom } from '@renderer/jotai/keyboard'
import { setCommandToCtrl as saveCommandToCtrl } from '@renderer/libs/storage'

export const CommandToCtrl = () => {
  const { t } = useTranslation()
  const [commandToCtrl, setCommandToCtrl] = useAtom(commandToCtrlAtom)

  const handleCommandToCtrlChange = (checked: boolean) => {
    setCommandToCtrl(checked)
    saveCommandToCtrl(checked)
  }

  return (
    <div className="flex cursor-pointer items-center justify-between px-3 py-2 hover:bg-neutral-100">
      <span className="text-sm">{t('keyboard.commandToCtrl')}</span>
      <Switch size="small" checked={commandToCtrl} onChange={handleCommandToCtrlChange} />
    </div>
  )
}