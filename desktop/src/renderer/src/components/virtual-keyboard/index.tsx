import { ReactElement, useRef, useState } from 'react'
import clsx from 'clsx'
import { useAtom } from 'jotai'
import { XIcon } from 'lucide-react'
import Keyboard, { KeyboardButtonTheme } from 'react-simple-keyboard'
import { Drawer } from 'vaul'

import 'react-simple-keyboard/build/css/index.css'
import '@renderer/assets/styles/keyboard.css'

import { isKeyboardOpenAtom } from '@renderer/jotai/keyboard'
import { Modifiers } from '@renderer/libs/device/keyboard';
import { KeyboardCodes } from '@renderer/libs/keyboard'

import {
  doubleKeys,
  keyboardArrowsOptions,
  keyboardControlPadOptions,
  keyboardOptions,
  modifierKeys,
  specialKeyMap
} from './keys'
import { IpcEvents } from '@common/ipc-events'

type KeyboardProps = {
  isBigScreen: boolean
}

export const VirtualKeyboard = ({ isBigScreen }: KeyboardProps): ReactElement => {
  const [isKeyboardOpen, setIsKeyboardOpen] = useAtom(isKeyboardOpenAtom)

  const [activeModifierKeys, setActiveModifierKeys] = useState<string[]>([])

  const keyboardRef = useRef<any>(null)

  async function onKeyPress(key: string): Promise<void> {
    if (modifierKeys.includes(key)) {
      if (activeModifierKeys.includes(key)) {
        await sendKeydown(key)
        await sendKeyup()
      } else {
        setActiveModifierKeys([...activeModifierKeys, key])
      }
      return
    }

    await sendKeydown(key)
  }

  async function onKeyReleased(key: string): Promise<void> {
    if (modifierKeys.includes(key)) {
      return
    }

    await sendKeyup()
  }

  async function sendKeydown(key: string): Promise<void> {
    const specialKey = specialKeyMap.get(key)
    const code = KeyboardCodes.get(specialKey ? specialKey : key)
    if (!code) {
      console.log('unknown code: ', key)
      return
    }

    const modifiers = getModifiers()
    const keys = [0x00, 0x00, code, 0x00, 0x00, 0x00]
    await window.electron.ipcRenderer.invoke(IpcEvents.SEND_KEYBOARD, modifiers.encode(), keys)
  }

  async function sendKeyup(): Promise<void> {
    const modifiers = new Modifiers()
    const keys = [0x00, 0x00, 0x00, 0x00, 0x00, 0x00]
    await window.electron.ipcRenderer.invoke(IpcEvents.SEND_KEYBOARD, modifiers.encode(), keys)

    setActiveModifierKeys([])
  }

  function getModifiers(): Modifiers {
    const modifiers = new Modifiers()

    activeModifierKeys.forEach((modifierKey) => {
      const specialKey = specialKeyMap.get(modifierKey)!
      switch (specialKey) {
        case 'ControlLeft':
          modifiers.leftCtrl = true
          break
        case 'ControlRight':
          modifiers.rightCtrl = true
          break
        case 'ShiftLeft':
          modifiers.leftShift = true
          break
        case 'ShiftRight':
          modifiers.rightShift = true
          break
        case 'AltLeft':
          modifiers.leftAlt = true
          break
        case 'AltRight':
          modifiers.rightAlt = true
          break
        case 'MetaLeft':
          modifiers.leftWindows = true
          break
        case 'MetaRight':
          modifiers.rightWindows = true
          break
        default:
          break
      }
    })

    return modifiers
  }

  function getButtonTheme(): KeyboardButtonTheme[] {
    const theme = [{ class: 'hg-double', buttons: doubleKeys.join(' ') }]

    if (activeModifierKeys.length > 0) {
      const buttons = activeModifierKeys.join(' ')
      theme.push({ class: 'hg-highlight', buttons })
    }

    return theme
  }

  return (
    <Drawer.Root open={isKeyboardOpen} onOpenChange={setIsKeyboardOpen} modal={false}>
      <Drawer.Portal>
        <Drawer.Content
          className={clsx(
            'fixed right-0 bottom-0 left-0 z-[999] mx-auto overflow-hidden rounded bg-white outline-none',
            isBigScreen ? 'w-[820px]' : 'w-[650px]'
          )}
        >
          {/* header */}
          <div className="flex justify-end px-3 py-1">
            <div
              className="flex h-[20px] w-[20px] cursor-pointer items-center justify-center rounded text-neutral-600 hover:bg-neutral-300 hover:text-white"
              onClick={() => setIsKeyboardOpen(false)}
            >
              <XIcon size={18} />
            </div>
          </div>

          <div className="h-px flex-shrink-0 border-b bg-neutral-300" />

          <div data-vaul-no-drag className="keyboardContainer w-full">
            {/* main keyboard */}
            <Keyboard
              buttonTheme={getButtonTheme()}
              keyboardRef={(r: any) => (keyboardRef.current = r)}
              onKeyPress={onKeyPress}
              onKeyReleased={onKeyReleased}
              layoutName="default"
              {...keyboardOptions}
            />

            {/* control keyboard */}
            {isBigScreen && (
              <div className="controlArrows">
                <Keyboard
                  onKeyPress={onKeyPress}
                  onKeyReleased={onKeyReleased}
                  {...keyboardControlPadOptions}
                />

                <Keyboard
                  onKeyPress={onKeyPress}
                  onKeyReleased={onKeyReleased}
                  {...keyboardArrowsOptions}
                />
              </div>
            )}
          </div>
        </Drawer.Content>
        <Drawer.Overlay />
      </Drawer.Portal>
    </Drawer.Root>
  )
}
