import { useState } from 'react';
import { SendHorizonal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Popover } from 'antd';

import { Shortcut } from './shortcut.tsx';

export const KeyboardShortcutsMenu = () => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <Popover
      content={
        <div className="flex flex-col gap-1">
          {[
            {
              label: t('keyboard.ctrlAltDel'),
              modifiers: { leftCtrl: true, leftAlt: true },
              keyCode: 'Delete',
            },
            {
              label: t('keyboard.ctrlD'),
              modifiers: { leftCtrl: true },
              keyCode: 'KeyD',
            },
            {
              label: t('keyboard.winTab'),
              modifiers: { leftWindows: true },
              keyCode: 'Tab',
            },
          ].map((shortcut) => (
            <Shortcut
              key={shortcut.keyCode}
              label={shortcut.label}
              modifiers={shortcut.modifiers}
              keyCode={shortcut.keyCode}
            />
          ))}
        </div>
      }
      trigger="click"
      placement="rightTop"
      align={{ offset: [14, 0] }}
      open={open}
      onOpenChange={setOpen}
      arrow={false}
    >
      <div className="flex h-[30px] cursor-pointer items-center space-x-1 rounded px-3 text-neutral-300 hover:bg-neutral-700/60">
        <SendHorizonal size={18} />
        <span>{t('keyboard.shortcuts')}</span>
      </div>
    </Popover>
  );
};
