import { useState } from 'react';
import { Popover } from 'antd';
import { useAtomValue } from 'jotai';
import { KeyboardIcon } from 'lucide-react';

import { menuConfigAtom } from '@/jotai/device';
import type { KeyboardSubItemId } from '@/libs/menu-config';

import { Paste } from './paste.tsx';
import { Shortcuts } from './shortcuts';
import { VirtualKeyboard } from './virtual-keyboard.tsx';

const KEYBOARD_SUB_COMPONENTS: Record<KeyboardSubItemId, React.FC> = {
  'keyboard.paste': Paste,
  'keyboard.virtualKeyboard': VirtualKeyboard,
  'keyboard.shortcuts': Shortcuts,
};

export const Keyboard = () => {
  const menuConfig = useAtomValue(menuConfigAtom);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const content = (
    <div className="flex flex-col space-y-0.5">
      {menuConfig.subMenus.keyboard.map((itemId) => {
        const Component = KEYBOARD_SUB_COMPONENTS[itemId];
        return Component ? <Component key={itemId} /> : null;
      })}
    </div>
  );

  return (
    <Popover
      content={content}
      placement="bottomLeft"
      trigger="click"
      arrow={false}
      open={isPopoverOpen}
      onOpenChange={setIsPopoverOpen}
    >
      <div className="flex h-[28px] w-[28px] cursor-pointer items-center justify-center rounded text-neutral-300 hover:bg-neutral-700/70 hover:text-white">
        <KeyboardIcon size={18} />
      </div>
    </Popover>
  );
};
