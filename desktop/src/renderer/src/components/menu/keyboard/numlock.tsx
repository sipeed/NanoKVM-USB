import { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { IpcEvents } from '@common/ipc-events'

export const NumLock = (): ReactElement => {
  const { t } = useTranslation()

  async function sendNumLock() {
    // NumLock key code is 83
    const modifiers = 0x00
    const keys = [0x00, 0x00, 83, 0x00, 0x00, 0x00]
    
    // Send key down
    await window.electron.ipcRenderer.invoke(IpcEvents.SEND_KEYBOARD, modifiers, keys)
    
    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 50))
    
    // Send key up (all zeros)
    const releaseKeys = [0x00, 0x00, 0x00, 0x00, 0x00, 0x00]
    await window.electron.ipcRenderer.invoke(IpcEvents.SEND_KEYBOARD, modifiers, releaseKeys)
  }

  return (
    <div
      className="flex h-[36px] cursor-pointer items-center justify-between rounded px-3 hover:bg-neutral-700/70"
      onClick={sendNumLock}
    >
      <span>NumLock</span>
    </div>
  )
}
