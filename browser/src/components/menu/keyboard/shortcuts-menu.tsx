import { useState } from 'react';
import { SendHorizonal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Popover } from 'antd';

import { CtrlAltDel } from './ctrl-alt-del';
import { CtrlD } from './ctrl-d.tsx';
import { WinTab } from './win-tab.tsx';

export const KeyboardShortcutsMenu = () => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <Popover
      content={
        <div className="flex flex-col gap-1">
          <CtrlAltDel />
          <CtrlD />
          <WinTab />
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
