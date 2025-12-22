import { useRef, useState } from 'react';
import clsx from 'clsx';
import { useAtom } from 'jotai';
import { XIcon } from 'lucide-react';
import Keyboard, { KeyboardButtonTheme } from 'react-simple-keyboard';
import { Drawer } from 'vaul';

import 'react-simple-keyboard/build/css/index.css';
import '@/assets/keyboard.css';

import { isKeyboardOpenAtom } from '@/jotai/keyboard.ts';
import { device } from '@/libs/device';
import { Modifiers } from '@/libs/device/keyboard.ts';
import { KeyboardCodes } from '@/libs/keyboard';

import {
  doubleKeys,
  keyboardArrowsOptions,
  keyboardControlPadOptions,
  keyboardOptions,
  modifierKeys,
  specialKeyMap
} from './keys.ts';

type KeyboardProps = {
  isBigScreen: boolean;
};

export const VirtualKeyboard = ({ isBigScreen }: KeyboardProps) => {
  const [isKeyboardOpen, setIsKeyboardOpen] = useAtom(isKeyboardOpenAtom);

  const [activeModifierKeys, setActiveModifierKeys] = useState<string[]>([]);

  const keyboardRef = useRef<any>(null);

  async function onKeyPress(key: string) {
    if (modifierKeys.includes(key)) {
      if (activeModifierKeys.includes(key)) {
        await sendKeydown(key);
        await sendKeyup();
      } else {
        setActiveModifierKeys([...activeModifierKeys, key]);
      }
      return;
    }

    await sendKeydown(key);
  }

  async function onKeyReleased(key: string) {
    if (modifierKeys.includes(key)) {
      return;
    }

    await sendKeyup();
  }

  async function sendKeydown(key: string) {
    const specialKey = specialKeyMap.get(key);
    const code = KeyboardCodes.get(specialKey ? specialKey : key);
    if (!code) {
      console.log('unknown code: ', key);
      return;
    }

    const modifiers = getModifiers();
    const keys = [code, 0x00, 0x00, 0x00, 0x00, 0x00];
    await device.sendKeyboardData(modifiers, keys);
  }

  async function sendKeyup() {
    const modifiers = new Modifiers();
    const keys = [0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
    await device.sendKeyboardData(modifiers, keys);

    setActiveModifierKeys([]);
  }

  function getModifiers() {
    const modifiers = new Modifiers();

    activeModifierKeys.forEach((modifierKey) => {
      const code = specialKeyMap.get(modifierKey)!;
      modifiers.setModifier(code);
    });

    return modifiers;
  }

  function getButtonTheme(): KeyboardButtonTheme[] {
    const theme = [{ class: 'hg-double', buttons: doubleKeys.join(' ') }];

    if (activeModifierKeys.length > 0) {
      const buttons = activeModifierKeys.join(' ');
      theme.push({ class: 'hg-highlight', buttons });
    }

    return theme;
  }

  return (
    <Drawer.Root open={isKeyboardOpen} onOpenChange={setIsKeyboardOpen} modal={false}>
      <Drawer.Portal>
        <Drawer.Content
          className={clsx(
            'fixed bottom-0 left-0 right-0 z-[999] mx-auto overflow-hidden rounded bg-white outline-none',
            isBigScreen ? 'w-[820px]' : 'w-[650px]'
          )}
        >
          {/* header */}
          <div className="flex justify-end px-3 py-1">
            <div
              className="flex h-[20px] w-[20px] cursor-pointer items-center justify-center rounded text-neutral-600 hover:bg-neutral-300 hover:text-white"
              onClick={() => setIsKeyboardOpen(false)}
            >
              <XIcon size={18} />
            </div>
          </div>

          <div className="h-px flex-shrink-0 border-b bg-neutral-300" />

          <div data-vaul-no-drag className="keyboardContainer w-full">
            {/* main keyboard */}
            <Keyboard
              buttonTheme={getButtonTheme()}
              keyboardRef={(r: any) => (keyboardRef.current = r)}
              onKeyPress={onKeyPress}
              onKeyReleased={onKeyReleased}
              layoutName="default"
              {...keyboardOptions}
            />

            {/* control keyboard */}
            {isBigScreen && (
              <div className="controlArrows">
                <Keyboard
                  onKeyPress={onKeyPress}
                  onKeyReleased={onKeyReleased}
                  {...keyboardControlPadOptions}
                />

                <Keyboard
                  onKeyPress={onKeyPress}
                  onKeyReleased={onKeyReleased}
                  {...keyboardArrowsOptions}
                />
              </div>
            )}
          </div>
        </Drawer.Content>
        <Drawer.Overlay />
      </Drawer.Portal>
    </Drawer.Root>
  );
};
