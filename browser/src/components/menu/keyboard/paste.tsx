import { useState } from 'react';
import { ClipboardIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { device } from '@/libs/device';
import { Modifiers } from '@/libs/device/keyboard.ts';
import { CharCodes, ShiftChars } from '@/libs/keyboard';

export const Paste = () => {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);

  async function paste() {
    if (isLoading) return;
    setIsLoading(true);

    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;

      for (const char of text) {
        const ascii = char.charCodeAt(0);

        const code = CharCodes.get(ascii);
        if (!code) continue;

        const modifiers = new Modifiers();
        if ((ascii >= 65 && ascii <= 90) || ShiftChars.has(ascii)) {
          modifiers.leftShift = true;
        }

        await send(modifiers, code);
      }
    } catch (e) {
      console.log(e);
    } finally {
      setIsLoading(false);
    }
  }

  async function send(modifiers: Modifiers, code: number) {
    const keys = [code, 0x00, 0x00, 0x00, 0x00, 0x00];
    await device.sendKeyboardData(modifiers, keys);

    await device.sendKeyboardData(new Modifiers(), [0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
  }

  return (
    <div
      className="flex h-[32px] cursor-pointer items-center space-x-2 rounded px-3 text-neutral-300 hover:bg-neutral-700/50"
      onClick={paste}
    >
      <ClipboardIcon size={18} />
      <span>{t('keyboard.paste')}</span>
    </div>
  );
};
