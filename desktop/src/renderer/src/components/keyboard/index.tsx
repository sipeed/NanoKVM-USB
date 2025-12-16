import { ReactElement, useEffect, useRef } from 'react'
import { Modifiers } from '@renderer/libs/device/keyboard'
import { KeyboardCodes } from '@renderer/libs/keyboard'
import { IpcEvents } from '@common/ipc-events'

export const Keyboard = (): ReactElement => {
  const MAX_SIMULTANEOUS_KEYS = 4
  const modifierKeys = new Set(['Control', 'Shift', 'Alt', 'Meta'])
  const pressedKeysRef = useRef<Set<number>>(new Set())
  const pressedModifiersRef = useRef<Set<string>>(new Set())

  // listen keyboard events
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [])

  // press button
  async function handleKeyDown(event: KeyboardEvent) {
    event.preventDefault()
    event.stopPropagation()

    if (modifierKeys.has(event.key)) {
      pressedModifiersRef.current.add(event.code)
    } else {
      const keyCode = KeyboardCodes.get(event.code)
      if (
        keyCode !== undefined &&
        !pressedKeysRef.current.has(keyCode) &&
        pressedKeysRef.current.size < MAX_SIMULTANEOUS_KEYS
      ) {
        pressedKeysRef.current.add(keyCode)
      }
    }

    await sendKeyData(event)
  }

  // release button
  async function handleKeyUp(event: KeyboardEvent) {
    event.preventDefault()
    event.stopPropagation()

    if (modifierKeys.has(event.key)) {
      pressedModifiersRef.current.delete(event.code)
    } else {
      const commonKeyCode = KeyboardCodes.get(event.code)
      if (commonKeyCode !== undefined && pressedKeysRef.current.has(commonKeyCode)) {
        pressedKeysRef.current.delete(commonKeyCode)
      }
    }

    await sendKeyData(event)
  }

  async function sendKeyData(event: KeyboardEvent) {
    const modifiers = Modifiers.getModifiers(event, pressedModifiersRef.current)
    const keys = [
      0x00,
      0x00,
      ...Array.from(pressedKeysRef.current),
      ...new Array(MAX_SIMULTANEOUS_KEYS - pressedKeysRef.current.size).fill(0x00)
    ]

    await window.electron.ipcRenderer.invoke(IpcEvents.SEND_KEYBOARD, modifiers.encode(), keys)
  }

  return <></>
}

