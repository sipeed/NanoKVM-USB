import { useCallback, useEffect, useRef, useState } from 'react';
import { Divider } from 'antd';
import clsx from 'clsx';
import { useAtomValue } from 'jotai';
import { ChevronRightIcon, GripVerticalIcon, XIcon } from 'lucide-react';
import Draggable from 'react-draggable';

import { serialStateAtom } from '@/jotai/device.ts';
import * as storage from '@/libs/storage';

import { Audio } from './audio';
import { Fullscreen } from './fullscreen';
import { Keyboard } from './keyboard';
import { Mouse } from './mouse';
import { Recorder } from './recorder';
import { SerialPort } from './serial-port';
import { Settings } from './settings';
import { Video } from './video';

export const Menu = () => {
  const serialState = useAtomValue(serialStateAtom);

  const [isMenuOpen, setIsMenuOpen] = useState(true);
  const [menuBounds, setMenuBounds] = useState({ left: 0, right: 0, top: 0, bottom: 0 });

  const nodeRef = useRef<HTMLDivElement | null>(null);

  const handleResize = useCallback(() => {
    if (!nodeRef.current) return;

    const elementRect = nodeRef.current.getBoundingClientRect();
    const width = (window.innerWidth - elementRect.width) / 2;

    setMenuBounds({
      left: -width,
      top: -10,
      right: width,
      bottom: window.innerHeight - elementRect.height - 10
    });
  }, []);

  useEffect(() => {
    const isOpen = storage.getIsMenuOpen();
    setIsMenuOpen(isOpen);

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [handleResize]);

  useEffect(() => {
    handleResize();
  }, [isMenuOpen, serialState, handleResize]);

  function toggleMenu() {
    const isOpen = !isMenuOpen;

    setIsMenuOpen(isOpen);
    storage.setIsMenuOpen(isOpen);
  }

  return (
    <Draggable
      nodeRef={nodeRef}
      bounds={menuBounds}
      handle="strong"
      positionOffset={{ x: '-50%', y: '0%' }}
    >
      <div
        ref={nodeRef}
        className="fixed left-1/2 top-[10px] z-[1000] -translate-x-1/2 transition-opacity duration-300"
      >
        {/* Menubar */}
        <div className="sticky top-[10px] flex w-full justify-center">
          <div
            className={clsx(
              'h-[34px] items-center justify-between space-x-1.5 rounded bg-neutral-800/70 px-2',
              isMenuOpen ? 'flex' : 'hidden'
            )}
          >
            <strong>
              <div className="flex h-[28px] cursor-move select-none items-center justify-center text-neutral-400">
                <GripVerticalIcon size={18} />
              </div>
            </strong>
            <Divider type="vertical" />

            <Video />
            <Audio />

            {serialState === 'connected' && (
              <>
                <SerialPort />

                <Divider type="vertical" className="px-0.5" />

                <Keyboard />
                <Mouse />
              </>
            )}

            <Recorder />

            <Divider type="vertical" className="px-0.5" />

            <Settings />
            <Fullscreen />
            <div
              className="flex h-[28px] w-[28px] cursor-pointer items-center justify-center rounded text-white hover:bg-neutral-700/70"
              onClick={toggleMenu}
            >
              <XIcon size={18} />
            </div>
          </div>

          {/* Menubar expand button */}
          {!isMenuOpen && (
            <div className="flex items-center rounded-lg bg-neutral-800/50 p-1">
              <strong>
                <div className="flex size-[26px] cursor-move select-none items-center justify-center text-neutral-400">
                  <GripVerticalIcon size={18} />
                </div>
              </strong>
              <Divider type="vertical" style={{ margin: '0 4px' }} />
              <div
                className="flex size-[26px] cursor-pointer items-center justify-center rounded text-neutral-400 hover:bg-neutral-700/70 hover:text-white"
                onClick={toggleMenu}
              >
                <ChevronRightIcon size={18} />
              </div>
            </div>
          )}
        </div>
      </div>
    </Draggable>
  );
};
