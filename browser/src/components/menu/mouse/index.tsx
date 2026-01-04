import { useEffect, useState } from 'react';
import { Divider, Popover } from 'antd';
import { useAtom, useSetAtom } from 'jotai';
import { MouseIcon } from 'lucide-react';

import {
  mouseJigglerModeAtom,
  mouseModeAtom,
  mouseStyleAtom,
  scrollDirectionAtom,
  scrollIntervalAtom
} from '@/jotai/mouse.ts';
import { mouseJiggler } from '@/libs/mouse-jiggler';
import * as storage from '@/libs/storage';

import { Direction } from './direction.tsx';
import { Jiggler } from './jiggler.tsx';
import { Mode } from './mode.tsx';
import { Speed } from './speed.tsx';
import { Style } from './style.tsx';

export const Mouse = () => {
  const [mouseStyle, setMouseStyle] = useAtom(mouseStyleAtom);
  const [mouseMode, setMouseMode] = useAtom(mouseModeAtom);
  const setScrollDirection = useSetAtom(scrollDirectionAtom);
  const setScrollInterval = useSetAtom(scrollIntervalAtom);
  const setMouseJigglerMode = useSetAtom(mouseJigglerModeAtom);

  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  useEffect(() => {
    initMouse();
  }, []);

  function initMouse() {
    const style = storage.getMouseStyle();
    if (style && style !== mouseStyle) {
      setMouseStyle(style);
    }

    const mode = storage.getMouseMode();
    if (mode && mode !== mouseMode) {
      setMouseMode(mode);
    }

    const direction = storage.getMouseScrollDirection();
    if (direction) {
      setScrollDirection(direction > 0 ? 1 : -1);
    }

    const interval = storage.getMouseScrollInterval();
    if (interval) {
      setScrollInterval(interval);
    }

    const jiggler = storage.getMouseJigglerMode();
    mouseJiggler.setMode(jiggler);
    setMouseJigglerMode(jiggler);
  }

  const content = (
    <div className="flex flex-col space-y-0.5">
      <Style />
      <Mode />
      <Direction />
      <Speed />

      <Divider style={{ margin: '5px 0 5px 0' }} />
      <Jiggler />
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
        <MouseIcon size={18} />
      </div>
    </Popover>
  );
};
