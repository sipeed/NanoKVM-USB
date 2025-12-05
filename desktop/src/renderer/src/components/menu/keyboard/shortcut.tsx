import { useState, PropsWithChildren } from 'react';
import { SendHorizonal } from 'lucide-react';
import { Modifiers, ShortcutProps } from '@renderer/libs/device/keyboard';
import { KeyboardCodes } from '@renderer/libs/keyboard'
import { IpcEvents } from '@common/ipc-events'

type ShortcutPropsWithChildren = ShortcutProps & PropsWithChildren

export const Shortcut = (
  { label, modifiers = {}, keyCode , children}: ShortcutPropsWithChildren
) => {
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
    await window.electron.ipcRenderer.invoke(IpcEvents.SEND_KEYBOARD, mods.encode(), keys)
    await window.electron.ipcRenderer.invoke(
      IpcEvents.SEND_KEYBOARD,
      new Modifiers().encode(),
      [0x00, 0x00, 0x00, 0x00, 0x00, 0x00]
    );
  }

  return (
    <div
      className="flex h-[30px] cursor-pointer items-center space-x-1 rounded px-3 text-neutral-300 hover:bg-neutral-700/60"
      onClick={handleClick}
    >
      <SendHorizonal size={18} />
      <span className="w-full">{label}</span>
      {children}
    </div>
  );
};
