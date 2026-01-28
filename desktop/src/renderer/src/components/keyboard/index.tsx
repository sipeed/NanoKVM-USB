import { ReactElement, useEffect, useRef } from 'react'
import { useAtomValue } from 'jotai'

import { IpcEvents } from '@common/ipc-events'
import { commandToCtrlAtom, ignoreCapsLockAtom, isKeyboardEnableAtom } from '@renderer/jotai/keyboard'
import { KeyboardReport } from '@renderer/libs/keyboard/keyboard'
import { isModifier } from '@renderer/libs/keyboard/keymap'

interface AltGrState {
  active: boolean
  ctrlLeftTimestamp: number
}

const ALTGR_THRESHOLD_MS = 10

export const Keyboard = (): ReactElement => {
  const isKeyboardEnabled = useAtomValue(isKeyboardEnableAtom)
  const commandToCtrl = useAtomValue(commandToCtrlAtom)
  const ignoreCapsLock = useAtomValue(ignoreCapsLockAtom)

  const keyboardRef = useRef(new KeyboardReport())
  const pressedKeys = useRef(new Set<string>())
  const altGrState = useRef<AltGrState | null>(null)
  const isComposing = useRef(false)
  const commandToCtrlRef = useRef(commandToCtrl)
  const ignoreCapsLockRef = useRef(ignoreCapsLock)
  
  // Update ref when atom value changes
  useEffect(() => {
    commandToCtrlRef.current = commandToCtrl
  }, [commandToCtrl])

  useEffect(() => {
    ignoreCapsLockRef.current = ignoreCapsLock
  }, [ignoreCapsLock])

  useEffect(() => {
    initAltGr()

    if (!isKeyboardEnabled) {
      releaseKeys()
      return
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('keyup', handleKeyUp)
    document.addEventListener('compositionstart', handleCompositionStart)
    document.addEventListener('compositionend', handleCompositionEnd)
    window.addEventListener('blur', handleBlur)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    // Key down event
    async function handleKeyDown(event: KeyboardEvent): Promise<void> {
      if (!isKeyboardEnabled) return

      // Skip during IME composition
      if (isComposing.current || event.isComposing) return

      event.preventDefault()
      event.stopPropagation()

      // Fallback for Japanese keyboards with Microsoft IME where event.code is empty for right Shift
      let code = event.code
      if (!code && event.key === 'Shift') {
        code = 'ShiftRight'
      }
      
      // Ignore CapsLock if enabled (for Mac IME switching)
      if (code === 'CapsLock' && ignoreCapsLockRef.current) {
        console.log('[CapsLock] Ignored for IME')
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

      // Track the original code for pressedKeys (before Command->Control mapping)
      // This ensures Command key release detection still works properly
      if (pressedKeys.current.has(code)) {
        return
      }
      
      pressedKeys.current.add(code)
      
      // Debug log for CapsLock
      if (code === 'CapsLock') {
        console.log('[CapsLock] Sending keydown')
      }
      
      await handleKeyEvent({ type: 'keydown', code })
    }

    // Key up event
    async function handleKeyUp(event: KeyboardEvent): Promise<void> {
      if (!isKeyboardEnabled) return

      if (isComposing.current || event.isComposing) return

      event.preventDefault()
      event.stopPropagation()

      // Fallback for Japanese keyboards with Microsoft IME where event.code is empty for right Shift
      let code = event.code
      if (!code && event.key === 'Shift') {
        code = 'ShiftRight'
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
      
      // Debug log for CapsLock
      if (code === 'CapsLock') {
        console.log('[CapsLock] Sending keyup')
      }
      
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

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('keyup', handleKeyUp)
      document.removeEventListener('compositionstart', handleCompositionStart)
      document.removeEventListener('compositionend', handleCompositionEnd)
      window.removeEventListener('blur', handleBlur)
      document.removeEventListener('visibilitychange', handleVisibilityChange)

      releaseKeys()
    }
  }, [isKeyboardEnabled])

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
    
    // Convert macOS Command key to Windows Control key (if enabled)
    let code = event.code
    if (commandToCtrlRef.current) {
      if (code === 'MetaLeft') {
        code = 'ControlLeft'
      } else if (code === 'MetaRight') {
        code = 'ControlRight'
      }
    }
    
    const report = event.type === 'keydown' ? kb.keyDown(code) : kb.keyUp(code)
    await sendReport(report)
  }

  async function sendReport(report: number[]): Promise<void> {
    await window.electron.ipcRenderer.invoke(IpcEvents.SEND_KEYBOARD, report)
  }

  return <></>
}
