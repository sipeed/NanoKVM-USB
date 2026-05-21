import { ReactElement, useState } from 'react'
import { ClipboardIcon } from 'lucide-react'
import { useAtomValue } from 'jotai'
import { useTranslation } from 'react-i18next'

import { IpcEvents } from '@common/ipc-events'
import { keyboardLayoutAtom } from '@renderer/jotai/keyboard'
import { sendTextAsKeyboardReports } from '@renderer/libs/keyboard/layout'

export const Paste = (): ReactElement => {
  const { t } = useTranslation()
  const keyboardLayout = useAtomValue(keyboardLayoutAtom)
  const [isLoading, setIsLoading] = useState(false)

  async function paste(): Promise<void> {
    if (isLoading) return
    setIsLoading(true)

    try {
      const text = await navigator.clipboard.readText()
      if (!text) return

      await sendTextAsKeyboardReports(text, keyboardLayout, send, 100)
    } catch (e) {
      console.log(e)
    } finally {
      setIsLoading(false)
    }
  }

  async function send(report: number[]): Promise<void> {
    await window.electron.ipcRenderer.invoke(IpcEvents.SEND_KEYBOARD, report)
  }

  return (
    <div
      className="flex h-[30px] cursor-pointer items-center space-x-2 rounded px-3 text-neutral-300 hover:bg-neutral-700/50"
      onClick={paste}
    >
      <ClipboardIcon size={16} />
      <span>{t('keyboard.paste')}</span>
    </div>
  )
}
