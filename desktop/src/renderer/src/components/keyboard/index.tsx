import { ReactElement, useEffect, useRef } from 'react'

import { IpcEvents } from '@common/ipc-events'
import { KeyboardCodes } from '@renderer/libs/keyboard'

export const Keyboard = (): ReactElement => {
  const modifierKeys = new Set(['Control', 'Shift', 'Alt', 'Meta'])

  const lastKeyRef = useRef<KeyboardEvent>()
  const pressedKeysRef = useRef<Set<string>>(new Set())

  // listen keyboard events
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    // press button
    async function handleKeyDown(event: KeyboardEvent): Promise<void> {
      event.preventDefault()
      event.stopPropagation()

      lastKeyRef.current = event

      if (modifierKeys.has(event.key)) {
        pressedKeysRef.current.add(event.code)
        return
      }

      await sendKeyDown(event)
    }

    // release button
    async function handleKeyUp(event: KeyboardEvent): Promise<void> {
      event.preventDefault()
      event.stopPropagation()

      if (modifierKeys.has(event.key) && lastKeyRef.current?.code === event.code) {
        await sendKeyDown(lastKeyRef.current)

        lastKeyRef.current = undefined
        pressedKeysRef.current.clear()
      }

      await send(0, 0x00)
    }

    return (): void => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [])

  async function sendKeyDown(event: KeyboardEvent): Promise<void> {
    const code = KeyboardCodes.get(event.code)
    if (!code) return

    const modifier = getModifier(event)

    await send(modifier, code)
  }

  async function send(modifier: number, key: number): Promise<void> {
    await window.electron.ipcRenderer.invoke(IpcEvents.SEND_KEYBOARD, modifier, key)
  }

  function getModifier(e: KeyboardEvent): number {
    const altGraphKey = e.getModifierState('AltGraph')
    const pressedKeys = [
      altGraphKey || (e.ctrlKey && pressedKeysRef.current.has('ControlLeft')),
      e.shiftKey && pressedKeysRef.current.has('ShiftLeft'),
      e.altKey && pressedKeysRef.current.has('AltLeft'),
      e.metaKey && pressedKeysRef.current.has('MetaLeft'),
      e.ctrlKey && pressedKeysRef.current.has('ControlRight'),
      e.shiftKey && pressedKeysRef.current.has('ShiftRight'),
      altGraphKey || (e.altKey && pressedKeysRef.current.has('AltRight')),
      e.metaKey && pressedKeysRef.current.has('MetaRight')
    ]

    return pressedKeys.reduce((acc, isPressed, bit) => (isPressed ? acc | (1 << bit) : acc), 0)
  }

  return <></>
}
