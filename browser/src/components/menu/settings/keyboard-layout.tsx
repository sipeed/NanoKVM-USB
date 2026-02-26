import { Select } from 'antd';
import { useAtom } from 'jotai';
import { KeyboardIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { targetKeyboardLayoutAtom } from '@/jotai/keyboard.ts';
import { LAYOUTS } from '@/libs/keyboard/layouts.ts';
import * as storage from '@/libs/storage';

export const KeyboardLayout = () => {
  const { t } = useTranslation();
  const [layout, setLayout] = useAtom(targetKeyboardLayoutAtom);

  const options = Object.entries(LAYOUTS).map(([id, { name }]) => ({
    value: id,
    label: name,
  }));

  function handleChange(value: string) {
    setLayout(value);
    storage.setTargetKeyboardLayout(value);
  }

  return (
    <div className="flex h-[32px] items-center space-x-2 rounded px-3 text-neutral-300">
      <KeyboardIcon size={16} />
      <span className="text-sm">{t('settings.keyboardLayout.title')}:</span>
      <Select
        value={layout}
        onChange={handleChange}
        options={options}
        size="small"
        className="w-[120px]"
        popupMatchSelectWidth={false}
      />
    </div>
  );
};
