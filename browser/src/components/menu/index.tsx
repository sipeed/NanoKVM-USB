import { useEffect, useState } from 'react';
import { Divider } from 'antd';
import clsx from 'clsx';
import { useAtomValue } from 'jotai';
import { MenuIcon, XIcon } from 'lucide-react';

import { serialStateAtom } from '@/jotai/device.ts';
import * as storage from '@/libs/storage';

import { Fullscreen } from './fullscreen';
import { Keyboard } from './keyboard';
import { Mouse } from './mouse';
import { SerialPort } from './serial-port';
import { Settings } from './settings';
import { Video } from './video';
import { Recorder } from './recorder';

export const Menu = () => {
  const serialState = useAtomValue(serialStateAtom);

  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    const isOpen = storage.getIsMenuOpen();
    setIsMenuOpen(isOpen);
  }, []);

  function toggleMenu() {
    const isOpen = !isMenuOpen;

    setIsMenuOpen(isOpen);
    storage.setIsMenuOpen(isOpen);
  }

  return (
    <div className="fixed left-1/2 top-[10px] z-[1000] -translate-x-1/2">
      <div className="sticky top-[10px]">
        <div
          className={clsx(
            'h-[34px] items-center justify-between space-x-1.5 rounded bg-neutral-800/70 px-3',
            isMenuOpen ? 'flex' : 'hidden'
          )}
        >
          <Video />

          {serialState === 'connected' && (
            <>
              <SerialPort />

              <Divider type="vertical" />

              <Keyboard />
              <Mouse />
            </>
          )}

          <Divider type="vertical" />

          <Recorder />

          <Divider type="vertical" />

          <Settings />
          <Fullscreen />
          <div
            className="flex h-[28px] w-[28px] cursor-pointer items-center justify-center rounded text-white hover:bg-neutral-700/70"
            onClick={toggleMenu}
          >
            <XIcon size={18} />
          </div>
        </div>

        {!isMenuOpen && (
          <div
            className="flex h-[30px] w-[35px] cursor-pointer items-center justify-center rounded bg-neutral-800/50 text-white/50 hover:bg-neutral-800 hover:text-white"
            onClick={toggleMenu}
          >
            <MenuIcon size={18} />
          </div>
        )}
      </div>
    </div>
  );
};
