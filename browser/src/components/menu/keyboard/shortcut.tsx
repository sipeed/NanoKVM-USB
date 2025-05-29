import { useState } from 'react';
import { SendHorizonal } from 'lucide-react';

import { device } from '@/libs/device';
import { Modifiers } from '@/libs/device/keyboard.ts';
import { KeyboardCodes } from '@/libs/keyboard';

interface ShortcutProps {
  label: string;
  modifiers?: Partial<Modifiers>;
  keyCode: string;
}

export const Shortcut = ({ label, modifiers = {}, keyCode }: ShortcutProps) => {
  const [isLoading, setIsLoading] = useState(false);

  async function handleClick(): Promise<void> {
    if (isLoading) return;
    setIsLoading(true);

    try {
      const mods = new Modifiers();
      Object.assign(mods, modifiers);
      await send(mods, KeyboardCodes.get(keyCode)!);
    } catch (e) {
      console.log(e);
    } finally {
      setIsLoading(false);
    }
  }

  async function send(mods: Modifiers, code: number) {
    const keys = [0x00, 0x00, code, 0x00, 0x00, 0x00];
    await device.sendKeyboardData(mods, keys);
    await device.sendKeyboardData(new Modifiers(), [0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
  }

  return (
    <div
      className="flex h-[30px] cursor-pointer items-center space-x-1 rounded px-3 text-neutral-300 hover:bg-neutral-700/60"
      onClick={handleClick}
    >
      <SendHorizonal size={18} />
      <span>{label}</span>
    </div>
  );
};
