import { useState } from 'react';

import { Kbd, KbdGroup } from '@/components/ui/kbd.tsx';
import { device } from '@/libs/device';
import { KeyboardReport } from '@/libs/keyboard/keyboard.ts';

import type { Shortcut as ShortcutInterface } from './types.ts';

type ShortcutProps = {
  shortcut: ShortcutInterface;
};

export const Shortcut = ({ shortcut }: ShortcutProps) => {
  const [isLoading, setIsLoading] = useState(false);

  async function handleClick(): Promise<void> {
    if (isLoading) return;
    setIsLoading(true);

    try {
      await sendShortcut();
    } catch (err) {
      console.log(err);
    } finally {
      setIsLoading(false);
    }
  }

  async function sendShortcut(): Promise<void> {
    const keyboard = new KeyboardReport();

    for (const key of shortcut.keys) {
      const report = keyboard.keyDown(key.code);
      await device.sendKeyboardData(report);
    }

    const report = keyboard.reset();
    await device.sendKeyboardData(report);
  }

  return (
    <div
      className="flex h-[32px] w-full cursor-pointer items-center space-x-1 rounded px-3 hover:bg-neutral-700/30"
      onClick={handleClick}
    >
      {shortcut.keys.map((key, index) => (
        <KbdGroup key={index}>
          <Kbd>{key.label}</Kbd>
        </KbdGroup>
      ))}
    </div>
  );
};
