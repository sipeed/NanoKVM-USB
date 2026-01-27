import { ReactElement } from 'react'
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

  async function toggleNumLock(): Promise<void> {
    const newState = !numLock
    setNumLock(newState)

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
    <div
      onClick={toggleNumLock}
      className="flex h-[36px] cursor-pointer items-center justify-between rounded px-3 text-sm text-white hover:bg-neutral-700/70"
    >
      <span>{t('keyboard.numLock')}</span>
      <span className={`ml-4 text-xs ${numLock ? 'text-green-400' : 'text-gray-500'}`}>
        {numLock ? 'ON' : 'OFF'}
      </span>
    </div>
  )
}
