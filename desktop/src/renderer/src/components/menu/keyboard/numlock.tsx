import { ReactElement } from 'react'
import { Switch } from 'antd'
import { useAtom } from 'jotai'
import { useTranslation } from 'react-i18next'

import { IpcEvents } from '@common/ipc-events'
import { numLockAtom } from '@renderer/jotai/keyboard'

export const NumLock = (): ReactElement => {
  const { t } = useTranslation()
  const [numLock, setNumLock] = useAtom(numLockAtom)

  const platform = navigator.platform

  // Only show NumLock toggle on macOS
  if (!platform.toLowerCase().includes('mac')) {
    return <></>
  }

  async function handleNumLockChange(checked: boolean): Promise<void> {
    setNumLock(checked)

    // Send NumLock key press to toggle state
    const modifiers = 0x00
    const numLockKeyCode = 0x53 // NumLock/Clear key
    const report = [modifiers, 0x00, numLockKeyCode, 0x00, 0x00, 0x00, 0x00, 0x00]

    await window.electron.ipcRenderer.invoke(IpcEvents.SEND_KEYBOARD, report)

    // Release key
    const releaseReport = [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]
    await window.electron.ipcRenderer.invoke(IpcEvents.SEND_KEYBOARD, releaseReport)
  }

  return (
    <div className="flex h-[36px] items-center justify-between rounded px-3 text-sm text-white">
      <span>{t('keyboard.numLock')}</span>
      <Switch size="small" checked={numLock} onChange={handleNumLockChange} />
    </div>
  )
}
