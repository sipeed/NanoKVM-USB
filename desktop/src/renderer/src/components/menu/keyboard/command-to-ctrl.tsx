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
    <div className="flex h-[30px] cursor-pointer items-center justify-between space-x-2 rounded px-3 text-neutral-300 hover:bg-neutral-700/50">
      <span>{t('keyboard.commandToCtrl')}</span>
      <Switch size="small" checked={commandToCtrl} onChange={handleCommandToCtrlChange} />
    </div>
  )
}