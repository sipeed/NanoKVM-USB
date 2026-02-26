import { useCallback, useEffect, useRef, useState } from 'react';
import { Divider } from 'antd';
import clsx from 'clsx';
import { useAtomValue } from 'jotai';
import {
  ChevronRightIcon,
  GripVerticalIcon,
  XIcon,
  ArrowRightLeftIcon,
} from 'lucide-react';
import Draggable from 'react-draggable';

import { menuConfigAtom, serialStateAtom } from '@/jotai/device.ts';
import {
  type MenuItemId,
  type SubMenuItemId,
  isSubMenuItem,
  SERIAL_REQUIRED_ITEMS,
  getSubMenuItemMeta,
} from '@/libs/menu-config';
import * as storage from '@/libs/storage';

import { Audio } from './audio';
import { Fullscreen } from './fullscreen';
import { Keyboard } from './keyboard';
import { Mouse } from './mouse';
import { PromotedSubMenuItem } from './promoted-items';
import { Recorder } from './recorder';
import { SerialPort } from './serial-port';
import { Settings } from './settings';
import { Video } from './video';

// Map MenuItemId to its component
const MENU_ITEM_COMPONENTS: Record<MenuItemId, React.FC> = {
  video: Video,
  audio: Audio,
  serialPort: SerialPort,
  keyboard: Keyboard,
  mouse: Mouse,
  recorder: Recorder,
  settings: Settings,
  fullscreen: Fullscreen,
};

export const Menu = () => {
  const serialState = useAtomValue(serialStateAtom);
  const menuConfig = useAtomValue(menuConfigAtom);

  const [isMenuOpen, setIsMenuOpen] = useState(true);
  const [orientation, setOrientation] = useState<'horizontal' | 'vertical'>(
    storage.getMenuOrientation()
  );
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
  }, [isMenuOpen, serialState, menuConfig, orientation, handleResize]);

  function toggleMenu() {
    const isOpen = !isMenuOpen;
    setIsMenuOpen(isOpen);
    storage.setIsMenuOpen(isOpen);
  }

  function toggleOrientation() {
    const newOrientation = orientation === 'horizontal' ? 'vertical' : 'horizontal';
    setOrientation(newOrientation);
    storage.setMenuOrientation(newOrientation);
  }

  // Build the list of rendered menu items with dividers between serial/non-serial groups
  const renderMenuItems = () => {
    const elements: React.ReactNode[] = [];
    let lastRequiredSerial: boolean | null = null;

    for (const itemId of menuConfig.visibleItems) {
      let requiresSerial: boolean;
      let element: React.ReactNode;

      if (isSubMenuItem(itemId)) {
        // Promoted submenu item
        const meta = getSubMenuItemMeta(itemId as SubMenuItemId);
        requiresSerial = meta?.requiresSerial ?? false;

        if (requiresSerial && serialState !== 'connected') continue;

        element = <PromotedSubMenuItem key={itemId} itemId={itemId as SubMenuItemId} />;
      } else {
        const menuItemId = itemId as MenuItemId;
        requiresSerial = SERIAL_REQUIRED_ITEMS.includes(menuItemId);

        if (requiresSerial && serialState !== 'connected') continue;

        const Component = MENU_ITEM_COMPONENTS[menuItemId];
        if (!Component) continue;

        element = <Component key={menuItemId} />;
      }

      // Add divider at serial/non-serial transitions
      if (lastRequiredSerial !== null && lastRequiredSerial !== requiresSerial) {
        const dividerType = orientation === 'horizontal' ? 'vertical' : 'horizontal';
        elements.push(
          <Divider
            key={`div-${itemId}`}
            type={dividerType}
            className={orientation === 'horizontal' ? 'px-0.5' : ''}
            style={orientation === 'vertical' ? { margin: '2px 0' } : undefined}
          />
        );
      }

      elements.push(element);
      lastRequiredSerial = requiresSerial;
    }

    return elements;
  };

  const isVertical = orientation === 'vertical';

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
              'items-center justify-between rounded bg-neutral-800/70 px-2',
              isMenuOpen
                ? isVertical
                  ? 'flex flex-col space-y-1.5 py-2'
                  : 'flex h-[34px] space-x-1.5'
                : 'hidden'
            )}
          >
            <strong>
              <div className="flex h-[28px] cursor-move select-none items-center justify-center text-neutral-400">
                <GripVerticalIcon size={18} />
              </div>
            </strong>
            <Divider
              type={isVertical ? 'horizontal' : 'vertical'}
              style={isVertical ? { margin: '2px 0' } : undefined}
            />

            {renderMenuItems()}

            <Divider
              type={isVertical ? 'horizontal' : 'vertical'}
              style={isVertical ? { margin: '2px 0' } : undefined}
            />

            <div
              className="flex h-[28px] w-[28px] cursor-pointer items-center justify-center rounded text-neutral-400 hover:bg-neutral-700/70 hover:text-white"
              onClick={toggleOrientation}
              title={isVertical ? 'Switch to horizontal' : 'Switch to vertical'}
            >
              <ArrowRightLeftIcon size={16} />
            </div>
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
