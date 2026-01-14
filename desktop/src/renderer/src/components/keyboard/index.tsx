import { ReactElement, useEffect, useRef } from 'react'
import { useAtomValue } from 'jotai'

import { IpcEvents } from '@common/ipc-events'
import { isKeyboardEnableAtom } from '@renderer/jotai/keyboard'
import { KeyboardReport } from '@renderer/libs/keyboard/keyboard'
import { isModifier } from "@renderer/libs/keyboard/keymap"

export const Keyboard = (): ReactElement => {
  const isKeyboardEnabled = useAtomValue(isKeyboardEnableAtom)

  const keyboardRef = useRef(new KeyboardReport())
  const pressedKeys = useRef(new Set<string>())

  // Keyboard handler
  async function handleKeyEvent(event: { type: 'keydown' | 'keyup'; code: string }): Promise<void> {
    const kb = keyboardRef.current
    const report = event.type === 'keydown' ? kb.keyDown(event.code) : kb.keyUp(event.code)
    await sendReport(report)
  }

  async function sendReport(report: number[]): Promise<void> {
    await window.electron.ipcRenderer.invoke(IpcEvents.SEND_KEYBOARD, report)
  }

  useEffect(() => {
    if (!isKeyboardEnabled) {
      releaseKeys()
      return
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', handleBlur)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    // Key down event
    async function handleKeyDown(event: KeyboardEvent): Promise<void> {
      if (!isKeyboardEnabled) return

      event.preventDefault()
      event.stopPropagation()

      const code = event.code
      if (pressedKeys.current.has(code)) {
        return
      }

      pressedKeys.current.add(code)
      await handleKeyEvent({ type: 'keydown', code })
    }

    // Key up event
    async function handleKeyUp(event: KeyboardEvent): Promise<void> {
      if (!isKeyboardEnabled) return

      event.preventDefault()
      event.stopPropagation()

      const code = event.code

      if (code === 'MetaLeft' || code === 'MetaRight') {
        pressedKeys.current.forEach((pressedCode) => {
          if (!isModifier(pressedCode)) {
            handleKeyEvent({ type: 'keyup', code: pressedCode });
            pressedKeys.current.delete(pressedCode);
          }
        });
      }

      pressedKeys.current.delete(code)
      await handleKeyEvent({ type: 'keyup', code })
    }

    // Release all keys when window loses focus
    async function handleBlur(): Promise<void> {
      await releaseKeys()
    }

    // Release all keys before window closes
    async function handleVisibilityChange(): Promise<void> {
      if (document.hidden) {
        await releaseKeys()
      }
    }

    // Release all keys
    async function releaseKeys(): Promise<void> {
      for (const code of pressedKeys.current) {
        await handleKeyEvent({ type: 'keyup', code })
      }

      pressedKeys.current.clear()

      const report = keyboardRef.current.reset()
      await sendReport(report)
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', handleBlur)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [isKeyboardEnabled])

  return <></>
}
