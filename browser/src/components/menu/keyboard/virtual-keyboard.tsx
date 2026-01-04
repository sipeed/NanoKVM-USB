import { useSetAtom } from 'jotai';
import { KeyboardIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { isKeyboardOpenAtom } from '@/jotai/keyboard.ts';

export const VirtualKeyboard = () => {
  const { t } = useTranslation();
  const setIsKeyboardOpen = useSetAtom(isKeyboardOpenAtom);

  function toggleKeyboard() {
    setIsKeyboardOpen((isKeyboardOpen) => !isKeyboardOpen);
  }

  return (
    <div
      className="flex h-[32px] cursor-pointer items-center space-x-2 rounded px-3 text-neutral-300 hover:bg-neutral-700/50"
      onClick={toggleKeyboard}
    >
      <KeyboardIcon size={16} />
      <span>{t('keyboard.virtualKeyboard')}</span>
    </div>
  );
};
