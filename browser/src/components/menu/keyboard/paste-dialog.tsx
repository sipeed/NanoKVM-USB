import { ClipboardPasteIcon } from 'lucide-react';
import { useSetAtom } from 'jotai';
import { useTranslation } from 'react-i18next';

import { pasteStateAtom } from '@/components/paste-dialog';
import { getTargetKeyboardLayout } from '@/libs/storage';

export const PasteWithDialog = () => {
  const { t } = useTranslation();
  const setPasteState = useSetAtom(pasteStateAtom);

  async function openPasteDialog(): Promise<void> {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;
      
      const layoutId = getTargetKeyboardLayout();
      
      setPasteState({
        isOpen: true,
        text,
        layoutId,
        isPasting: false,
        progress: 0,
        currentChar: 0,
        totalChars: text.length
      });
    } catch (e) {
      console.log(e);
    }
  }

  return (
    <div
      className="flex h-[32px] cursor-pointer items-center space-x-2 rounded px-3 text-neutral-300 hover:bg-neutral-700/50"
      onClick={openPasteDialog}
    >
      <ClipboardPasteIcon size={16} />
      <span>{t('keyboard.pasteWithDialog', 'Paste with Preview')}</span>
    </div>
  );
};
