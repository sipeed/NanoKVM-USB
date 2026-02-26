import { useState } from 'react';
import { ClipboardIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { device } from '@/libs/device';
import { getLayoutById, initLayoutDetection, LayoutMap } from '@/libs/keyboard/layouts.ts';
import { ModifierBits } from '@/libs/keyboard/keymap.ts';

// Initialize layout detection early
initLayoutDetection();

// Paste text as keystrokes using the specified keyboard layout
export async function pasteText(text: string, layoutId: string = 'auto'): Promise<void> {
  const layout: LayoutMap = getLayoutById(layoutId);

  // Release all keys first to ensure clean state
  await device.sendKeyboardData([0, 0, 0, 0, 0, 0, 0, 0]);
  await new Promise((r) => setTimeout(r, 50));

  for (const char of text) {
    const mapping = layout[char];
    if (!mapping) {
      console.warn(`No mapping for character: '${char}' (code ${char.charCodeAt(0)})`);
      continue;
    }

    let modifier = 0;
    if (mapping.shift) {
      modifier |= ModifierBits.LeftShift;
    }
    if (mapping.altGr) {
      // AltGr is typically Right Alt
      modifier |= ModifierBits.RightAlt;
    }

    // For modified keys (Shift/AltGr), press modifier first, then key
    // This is more compatible with Windows login screen
    if (modifier !== 0) {
      await device.sendKeyboardData([modifier, 0, 0, 0, 0, 0, 0, 0]);
      await new Promise((r) => setTimeout(r, 20));
    }

    // Press key (with modifier held)
    await device.sendKeyboardData([modifier, 0, mapping.code, 0, 0, 0, 0, 0]);
    await new Promise((r) => setTimeout(r, 50));

    // Release key (modifier still held)
    if (modifier !== 0) {
      await device.sendKeyboardData([modifier, 0, 0, 0, 0, 0, 0, 0]);
      await new Promise((r) => setTimeout(r, 15));
    }

    // Release modifier
    await device.sendKeyboardData([0, 0, 0, 0, 0, 0, 0, 0]);
    if (mapping.altGr) {
      await new Promise((r) => setTimeout(r, 20));
      await device.sendKeyboardData([0, 0, 0, 0, 0, 0, 0, 0]);
    }
    await new Promise((r) => setTimeout(r, 30));
  }
}

export const Paste = () => {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);

  async function paste(): Promise<void> {
    if (isLoading) return;
    setIsLoading(true);

    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;
      await pasteText(text);
    } catch (e) {
      console.log(e);
    } finally {
      setIsLoading(false);
    }
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
