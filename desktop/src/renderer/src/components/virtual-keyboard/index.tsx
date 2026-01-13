import { ReactElement, useRef, useState } from 'react'
import clsx from 'clsx'
import { useAtom } from 'jotai'
import { XIcon } from 'lucide-react'
import Keyboard, { KeyboardButtonTheme } from 'react-simple-keyboard'
import { Drawer } from 'vaul'

import 'react-simple-keyboard/build/css/index.css'
import '@renderer/assets/styles/keyboard.css'

import { IpcEvents } from '@common/ipc-events'
import { isKeyboardOpenAtom } from '@renderer/jotai/keyboard'
import { KeyboardReport } from '@renderer/libs/keyboard/keyboard'

import {
  doubleKeys,
  keyboardArrowsOptions,
  keyboardControlPadOptions,
  keyboardOptions,
  modifierKeys,
  specialKeys
} from './virtual-keys'

interface KeyboardProps {
  isBigScreen: boolean
}

export const VirtualKeyboard = ({ isBigScreen }: KeyboardProps): ReactElement => {
  const [isKeyboardOpen, setIsKeyboardOpen] = useAtom(isKeyboardOpenAtom)

  const [activeModifierKeys, setActiveModifierKeys] = useState<string[]>([])

  const keyboardRef = useRef(new KeyboardReport())

  // Key down event
  async function onKeyPress(key: string): Promise<void> {
    if (modifierKeys[key]) {
      if (!activeModifierKeys.includes(key)) {
        // Save modifier key
        setActiveModifierKeys([...activeModifierKeys, key])
      } else {
        // Press and release modifier keys
        for (const modifierKey of activeModifierKeys) {
          await handleKeyEvent({ type: 'keydown', key: modifierKey })
        }
        for (const modifierKey of activeModifierKeys) {
          await handleKeyEvent({ type: 'keyup', key: modifierKey })
        }
        setActiveModifierKeys([])
      }
      return
    }

    for (const modifierKey of activeModifierKeys) {
      await handleKeyEvent({ type: 'keydown', key: modifierKey })
    }

    await handleKeyEvent({ type: 'keydown', key })
  }

  // Key up event
  async function onKeyReleased(key: string): Promise<void> {
    // Skip modifier key
    if (modifierKeys[key]) {
      return
    }

    for (const modifierKey of activeModifierKeys) {
      await handleKeyEvent({ type: 'keyup', key: modifierKey })
    }
    await handleKeyEvent({ type: 'keyup', key })

    setActiveModifierKeys([])
  }

  async function handleKeyEvent(event: { type: 'keydown' | 'keyup'; key: string }): Promise<void> {
    const code = specialKeys[event.key] ?? event.key

    const kb = keyboardRef.current
    const report = event.type === 'keydown' ? kb.keyDown(code) : kb.keyUp(code)

    await sendReport(report)
  }

  async function sendReport(report: number[]): Promise<void> {
    await window.electron.ipcRenderer.invoke(IpcEvents.SEND_KEYBOARD, report)
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
              className="flex h-5 w-5 cursor-pointer items-center justify-center rounded text-neutral-600 hover:bg-neutral-300 hover:text-white"
              onClick={() => setIsKeyboardOpen(false)}
            >
              <XIcon size={18} />
            </div>
          </div>

          <div data-vaul-no-drag className="keyboardContainer w-full">
            {/* main keyboard */}
            <Keyboard
              buttonTheme={getButtonTheme()}
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
