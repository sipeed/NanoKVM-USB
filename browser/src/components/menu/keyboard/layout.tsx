import { Select } from 'antd';
import { useAtom } from 'jotai';
import { KeyboardIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { keyboardLayoutAtom } from '@/jotai/keyboard.ts';
import type { KeyboardLayout } from '@/libs/keyboard/layout.ts';
import { KEYBOARD_LAYOUTS } from '@/libs/keyboard/layout.ts';
import { setKeyboardLayout } from '@/libs/storage';

export const KeyboardLayoutSelect = () => {
  const { t } = useTranslation();
  const [keyboardLayout, setKeyboardLayoutState] = useAtom(keyboardLayoutAtom);

  function changeKeyboardLayout(layout: KeyboardLayout) {
    setKeyboardLayout(layout);
    setKeyboardLayoutState(layout);
  }

  const options = KEYBOARD_LAYOUTS.map((layout) => ({
    value: layout,
    label: layout === 'de' ? t('keyboard.layoutDe') : t('keyboard.layoutUs')
  }));

  return (
    <div className="flex h-[32px] items-center justify-between space-x-3 rounded px-3 text-neutral-300">
      <div className="flex items-center space-x-2">
        <KeyboardIcon size={16} />
        <span>{t('keyboard.layout')}</span>
      </div>

      <Select<KeyboardLayout>
        size="small"
        className="w-[104px]"
        value={keyboardLayout}
        options={options}
        onChange={changeKeyboardLayout}
        onClick={(event) => event.stopPropagation()}
      />
    </div>
  );
};
