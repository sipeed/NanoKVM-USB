import { useState } from 'react';
import { ClipboardIcon } from 'lucide-react';
import { useAtomValue } from 'jotai';
import { useTranslation } from 'react-i18next';

import { keyboardLayoutAtom } from '@/jotai/keyboard.ts';
import { device } from '@/libs/device';
import { sendTextAsKeyboardReports } from '@/libs/keyboard/layout.ts';

export const Paste = () => {
  const { t } = useTranslation();
  const keyboardLayout = useAtomValue(keyboardLayoutAtom);
  const [isLoading, setIsLoading] = useState(false);

  async function paste(): Promise<void> {
    if (isLoading) return;
    setIsLoading(true);

    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;

      await sendTextAsKeyboardReports(text, keyboardLayout, send, 50);
    } catch (e) {
      console.log(e);
    } finally {
      setIsLoading(false);
    }
  }

  async function send(report: number[]): Promise<void> {
    await device.sendKeyboardData(report);
  }

  return (
    <div
      className="flex h-[32px] cursor-pointer items-center space-x-2 rounded px-3 text-neutral-300 hover:bg-neutral-700/50"
      onClick={paste}
    >
      <ClipboardIcon size={16} />
      <span>{t('keyboard.paste')}</span>
    </div>
  );
};
