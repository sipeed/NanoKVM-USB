import { ReactElement, useEffect, useRef } from 'react'
import { useAtomValue } from 'jotai'

import { IpcEvents } from '@common/ipc-events'
import { isKeyboardEnableAtom, keyboardLayoutAtom } from '@renderer/jotai/keyboard'
import { KeyboardReport } from '@renderer/libs/keyboard/keyboard'
import { getKeycode, isModifier } from '@renderer/libs/keyboard/keymap'
import { sendTextAsKeyboardReports } from '@renderer/libs/keyboard/layout'

interface AltGrState {
  active: boolean
  ctrlLeftTimestamp: number
}

const ALTGR_THRESHOLD_MS = 10

export const Keyboard = (): ReactElement => {
  const isKeyboardEnabled = useAtomValue(isKeyboardEnableAtom)
  const keyboardLayout = useAtomValue(keyboardLayoutAtom)

  const keyboardRef = useRef(new KeyboardReport())
  const pressedKeys = useRef(new Set<string>())
  const altGrState = useRef<AltGrState | null>(null)
  const isComposing = useRef(false)

  useEffect(() => {
    initAltGr()

    if (!isKeyboardEnabled) {
      releaseKeys()
      return
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('keyup', handleKeyUp)
    document.addEventListener('paste', handlePaste)
    document.addEventListener('compositionstart', handleCompositionStart)
    document.addEventListener('compositionend', handleCompositionEnd)
    window.addEventListener('blur', handleBlur)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    // Key down event
    async function handleKeyDown(event: KeyboardEvent): Promise<void> {
      if (!isKeyboardEnabled) return

      // Skip during IME composition
      if (isComposing.current || event.isComposing) return

      if (isPasteShortcut(event)) {
        event.preventDefault()
        event.stopPropagation()
        await pasteFromClipboard()
        return
      }

      event.preventDefault()
      event.stopPropagation()

      // Fallback for Japanese keyboards with Microsoft IME where event.code is empty for right Shift
      const code = normalizeKeyCode(event)
      if (shouldTypePrintableFallback(event, code)) {
        await typeText(event.key)
        return
      }

      if (pressedKeys.current.has(code)) {
        return
      }

      // When AltGr is pressed, browsers send ControlLeft followed immediately by AltRight
      if (altGrState.current) {
        if (code === 'ControlLeft') {
          altGrState.current.ctrlLeftTimestamp = event.timeStamp
        } else if (code === 'AltRight') {
          const timeDiff = event.timeStamp - altGrState.current.ctrlLeftTimestamp
          if (timeDiff < ALTGR_THRESHOLD_MS && pressedKeys.current.has('ControlLeft')) {
            pressedKeys.current.delete('ControlLeft')
            handleKeyEvent({ type: 'keyup', code: 'ControlLeft' })
            altGrState.current.active = true
          }
        }
      }

      pressedKeys.current.add(code)
      await handleKeyEvent({ type: 'keydown', code })
    }

    // Key up event
    async function handleKeyUp(event: KeyboardEvent): Promise<void> {
      if (!isKeyboardEnabled) return

      if (isComposing.current || event.isComposing) return

      event.preventDefault()
      event.stopPropagation()

      // Fallback for Japanese keyboards with Microsoft IME where event.code is empty for right Shift
      const code = normalizeKeyCode(event)
      if (shouldTypePrintableFallback(event, code)) {
        return
      }

      // Handle AltGr state for Windows
      if (altGrState.current?.active) {
        if (code === 'ControlLeft') return

        if (code === 'AltRight') {
          altGrState.current.active = false
        }
      }

      // Compatible with macOS's command key combinations
      if (code === 'MetaLeft' || code === 'MetaRight') {
        const keysToRelease: string[] = []
        pressedKeys.current.forEach((pressedCode) => {
          if (!isModifier(pressedCode)) {
            keysToRelease.push(pressedCode)
          }
        })

        for (const key of keysToRelease) {
          await handleKeyEvent({ type: 'keyup', code: key })
          pressedKeys.current.delete(key)
        }
      }

      pressedKeys.current.delete(code)
      await handleKeyEvent({ type: 'keyup', code })
    }

    // Composition start event
    function handleCompositionStart(): void {
      isComposing.current = true
    }

    // Composition end event
    function handleCompositionEnd(): void {
      isComposing.current = false
    }

    async function handlePaste(event: ClipboardEvent): Promise<void> {
      if (!isKeyboardEnabled) return
      if (isComposing.current) return

      event.preventDefault()
      event.stopPropagation()

      let text = event.clipboardData?.getData('text/plain')
      if (!text) {
        text = await navigator.clipboard.readText()
      }

      await typeText(text)
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

      // Reset AltGr state
      if (altGrState.current) {
        altGrState.current.active = false
        altGrState.current.ctrlLeftTimestamp = 0
      }

      const report = keyboardRef.current.reset()
      await sendReport(report)
    }

    async function pasteFromClipboard(): Promise<void> {
      try {
        const text = await navigator.clipboard.readText()
        await typeText(text)
      } catch (e) {
        console.log(e)
      }
    }

    async function typeText(text: string): Promise<void> {
      if (!text) return

      await releaseKeys()
      await sendTextAsKeyboardReports(text, keyboardLayout, sendReport, 100)
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('keyup', handleKeyUp)
      document.removeEventListener('paste', handlePaste)
      document.removeEventListener('compositionstart', handleCompositionStart)
      document.removeEventListener('compositionend', handleCompositionEnd)
      window.removeEventListener('blur', handleBlur)
      document.removeEventListener('visibilitychange', handleVisibilityChange)

      releaseKeys()
    }
  }, [isKeyboardEnabled, keyboardLayout])

  async function initAltGr(): Promise<void> {
    const platform = await window.electron.ipcRenderer.invoke(IpcEvents.GET_PLATFORM)
    const isWin = platform.toLowerCase().startsWith('win')
    if (isWin && !altGrState.current) {
      altGrState.current = { active: false, ctrlLeftTimestamp: 0 }
    }
  }

  // Keyboard handler
  async function handleKeyEvent(event: { type: 'keydown' | 'keyup'; code: string }): Promise<void> {
    const kb = keyboardRef.current
    const report = event.type === 'keydown' ? kb.keyDown(event.code) : kb.keyUp(event.code)
    await sendReport(report)
  }

  async function sendReport(report: number[]): Promise<void> {
    await window.electron.ipcRenderer.invoke(IpcEvents.SEND_KEYBOARD, report)
  }

  function normalizeKeyCode(event: KeyboardEvent): string {
    if (!event.code && event.key === 'Shift') {
      return 'ShiftRight'
    }

    return event.code
  }

  function isPasteShortcut(event: KeyboardEvent): boolean {
    return (event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'v'
  }

  function shouldTypePrintableFallback(event: KeyboardEvent, code: string): boolean {
    return isPrintableKey(event.key) && (!code || (!isModifier(code) && getKeycode(code) === undefined))
  }

  function isPrintableKey(key: string): boolean {
    return Array.from(key).length === 1 || key === '\n' || key === '\t'
  }

  return <></>
}
