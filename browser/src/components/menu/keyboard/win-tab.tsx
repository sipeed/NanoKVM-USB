import { useState } from 'react';
import { SendHorizonal } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { device } from '@/libs/device';
import { Modifiers } from '@/libs/device/keyboard.ts';
import { KeyboardCodes } from '@/libs/keyboard';

export const WinTab = () => {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);

  async function winTab(): Promise<void> {
    if (isLoading) return;
    setIsLoading(true);

    try {
      const modifiers = new Modifiers();
      modifiers.leftWindows = true;
      await send(modifiers, KeyboardCodes.get('Tab')!);
    } catch (e) {
      console.log(e);
    } finally {
      setIsLoading(false);
    }
  }

  async function send(modifiers: Modifiers, code: number) {
    const keys = [0x00, 0x00, code, 0x00, 0x00, 0x00];
    await device.sendKeyboardData(modifiers, keys);
    await device.sendKeyboardData(new Modifiers(), [0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
  }

  return (
    <div
      className="flex h-[30px] cursor-pointer items-center space-x-1 rounded px-3 text-neutral-300 hover:bg-neutral-700/60"
      onClick={winTab}
    >
      <SendHorizonal size={18} />
      <span>{t('keyboard.winTab')}</span>
    </div>
  );
}
