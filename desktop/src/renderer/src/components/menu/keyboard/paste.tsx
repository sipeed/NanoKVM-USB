import { ReactElement, useState } from 'react'
import { ClipboardIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IpcEvents } from '@common/ipc-events'
import { KeyboardReport } from '@renderer/libs/keyboard/keyboard'

export const Paste = (): ReactElement => {
  const { t } = useTranslation()
  const [isLoading, setIsLoading] = useState(false)

  async function paste(): Promise<void> {
    if (isLoading) return
    setIsLoading(true)

    try {
      const text = await navigator.clipboard.readText()
      if (!text) return

      const keyboardReport = new KeyboardReport()
      
      for (const char of text) {
        await typeChar(keyboardReport, char)
        await new Promise((r) => setTimeout(r, 100))
      }
      
      // Final release of all keys
      const releaseReport = keyboardReport.reset()
      await window.electron.ipcRenderer.invoke(IpcEvents.SEND_KEYBOARD, releaseReport)
    } catch (e) {
      console.log(e)
    } finally {
      setIsLoading(false)
    }
  }

  async function typeChar(keyboardReport: KeyboardReport, char: string): Promise<void> {
    const needsShift = char >= 'A' && char <= 'Z'
    
    // Press Shift if needed
    if (needsShift) {
      const shiftReport = keyboardReport.keyDown('ShiftLeft')
      await window.electron.ipcRenderer.invoke(IpcEvents.SEND_KEYBOARD, shiftReport)
      await new Promise((r) => setTimeout(r, 20))
    }
    
    const code = getCodeForChar(char)
    if (!code) {
      console.warn(`[Paste] Unsupported character: ${char}`)
      // Release Shift if it was pressed
      if (needsShift) {
        const releaseShift = keyboardReport.keyUp('ShiftLeft')
        await window.electron.ipcRenderer.invoke(IpcEvents.SEND_KEYBOARD, releaseShift)
      }
      return
    }

    // Press key
    const pressReport = keyboardReport.keyDown(code)
    await window.electron.ipcRenderer.invoke(IpcEvents.SEND_KEYBOARD, pressReport)
    
    await new Promise((r) => setTimeout(r, 50))
    
    // Release key
    const releaseReport = keyboardReport.keyUp(code)
    await window.electron.ipcRenderer.invoke(IpcEvents.SEND_KEYBOARD, releaseReport)
    
    // Release Shift if it was pressed
    if (needsShift) {
      await new Promise((r) => setTimeout(r, 20))
      const releaseShift = keyboardReport.keyUp('ShiftLeft')
      await window.electron.ipcRenderer.invoke(IpcEvents.SEND_KEYBOARD, releaseShift)
    }
  }

  function getCodeForChar(char: string): string | null {
    // Convert uppercase to lowercase for keycode lookup
    const lowerChar = char.toLowerCase()
    
    // Letters a-z
    if (lowerChar >= 'a' && lowerChar <= 'z') {
      return 'Key' + lowerChar.toUpperCase()
    }
    
    // Numbers 0-9
    if (lowerChar >= '0' && lowerChar <= '9') {
      return 'Digit' + lowerChar
    }
    
    // Special characters
    const specialChars: Record<string, string> = {
      ' ': 'Space',
      '\n': 'Enter',
      '\t': 'Tab',
      '-': 'Minus',
      '=': 'Equal',
      '[': 'BracketLeft',
      ']': 'BracketRight',
      '\\': 'Backslash',
      ';': 'Semicolon',
      "'": 'Quote',
      ',': 'Comma',
      '.': 'Period',
      '/': 'Slash',
      '`': 'Backquote'
    }
    
    return specialChars[char] || null
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
