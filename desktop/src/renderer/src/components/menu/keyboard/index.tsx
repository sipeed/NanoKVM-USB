import { useState, ReactElement } from 'react';
import { Popover } from 'antd';
import { KeyboardIcon } from 'lucide-react';

import { Paste } from './paste';
import { VirtualKeyboard } from './virtual-keyboard';
import { KeyboardShortcutsMenu } from './shortcuts-menu';

export const Keyboard = (): ReactElement => {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const content = (
    <div className="flex flex-col space-y-0.5">
      <Paste />
      <VirtualKeyboard />
      <KeyboardShortcutsMenu />
    </div>
  )

  return (
    <Popover
      content={content}
      placement="bottomLeft"
      trigger="click"
      arrow={false}
      open={isPopoverOpen}
      onOpenChange={setIsPopoverOpen}
    >
      <div className="flex h-[28px] w-[28px] cursor-pointer items-center justify-center rounded text-white hover:bg-neutral-700/70">
        <KeyboardIcon size={18} />
      </div>
    </Popover>
  )
}
