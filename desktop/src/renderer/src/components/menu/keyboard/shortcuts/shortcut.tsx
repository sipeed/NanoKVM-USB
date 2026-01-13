import { useState } from 'react'

import { IpcEvents } from '@common/ipc-events'
import { Kbd, KbdGroup } from '@renderer/components/ui/kbd'
import { KeyboardReport } from '@renderer/libs/keyboard/keyboard'

import type { Shortcut as ShortcutInterface } from './types'

type ShortcutProps = {
  shortcut: ShortcutInterface
}

export const Shortcut = ({ shortcut }: ShortcutProps) => {
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
    const keyboard = new KeyboardReport()

    for (const key of shortcut.keys) {
      const report = keyboard.keyDown(key.code)
      await send(report)
    }

    const report = keyboard.reset()
    await send(report)
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
