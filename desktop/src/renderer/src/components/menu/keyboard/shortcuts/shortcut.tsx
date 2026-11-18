import { ReactElement, useState } from 'react'

import { IpcEvents } from '@common/ipc-events'
import { Kbd, KbdGroup } from '@renderer/components/ui/kbd'
import { KeyboardReport } from '@renderer/libs/keyboard/keyboard'

import type { Shortcut as ShortcutInterface } from './types'

const KEY_INTERVAL_MS = 40
const KEY_HOLD_MS = 100

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

type ShortcutProps = {
  shortcut: ShortcutInterface
}

export const Shortcut = ({ shortcut }: ShortcutProps): ReactElement => {
  const [isLoading, setIsLoading] = useState(false)

  async function handleClick(): Promise<void> {
    if (isLoading) return
    setIsLoading(true)

    try {
      await sendShortcut()
    } catch (err) {
      console.log(err)
    } finally {
      setIsLoading(false)
    }
  }

  async function sendShortcut(): Promise<void> {
    if (shortcut.keys.length === 0) return

    const keyboard = new KeyboardReport()
    let released = false

    try {
      for (let i = 0; i < shortcut.keys.length; i++) {
        const report = keyboard.keyDown(shortcut.keys[i].code)
        await send(report)
        if (i < shortcut.keys.length - 1) {
          await sleep(KEY_INTERVAL_MS)
        }
      }

      await sleep(KEY_HOLD_MS)

      for (let i = shortcut.keys.length - 1; i >= 0; i--) {
        const report = keyboard.keyUp(shortcut.keys[i].code)
        await send(report)
        if (i > 0) {
          await sleep(KEY_INTERVAL_MS)
        }
      }
      released = true
    } finally {
      if (!released) {
        const report = keyboard.reset()
        await send(report).catch(() => {})
      }
    }
  }

  async function send(report: number[]): Promise<void> {
    await window.electron.ipcRenderer.invoke(IpcEvents.SEND_KEYBOARD, report)
  }

  return (
    <div
      className="flex h-8 w-full cursor-pointer items-center space-x-1 rounded px-3 hover:bg-neutral-700/30"
      onClick={handleClick}
    >
      {shortcut.keys.map((key, index) => (
        <KbdGroup key={index}>
          <Kbd>{key.label}</Kbd>
        </KbdGroup>
      ))}
    </div>
  )
}
