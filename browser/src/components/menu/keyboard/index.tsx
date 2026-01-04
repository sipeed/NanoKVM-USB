import { useState } from 'react';
import { Popover } from 'antd';
import { KeyboardIcon } from 'lucide-react';

import { Paste } from './paste.tsx';
import { Shortcuts } from './shortcuts';
import { VirtualKeyboard } from './virtual-keyboard.tsx';

export const Keyboard = () => {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const content = (
    <div className="flex flex-col space-y-0.5">
      <Paste />
      <VirtualKeyboard />
      <Shortcuts />
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
