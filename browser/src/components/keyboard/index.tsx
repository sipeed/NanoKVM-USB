import { useEffect, useRef } from 'react';

import { device } from '@/libs/device';
import { Modifiers } from '@/libs/device/keyboard.ts';
import { KeyboardCodes } from '@/libs/keyboard';

export const Keyboard = () => {
  const controlKeys = new Set(['Control', 'Shift', 'Alt', 'Meta']);

  const lastKeyRef = useRef<KeyboardEvent>();
  const pressedKeysRef = useRef<Set<string>>(new Set());

  // listen keyboard events
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // press button
  async function handleKeyDown(event: KeyboardEvent) {
    event.preventDefault();
    event.stopPropagation();

    lastKeyRef.current = event;

    if (controlKeys.has(event.key)) {
      pressedKeysRef.current.add(event.code);
      return;
    }

    await sendKeyDown(event);
  }

  // release button
  async function handleKeyUp(event: KeyboardEvent) {
    event.preventDefault();
    event.stopPropagation();

    if (controlKeys.has(event.key) && lastKeyRef.current?.code === event.code) {
      await sendKeyDown(lastKeyRef.current);

      lastKeyRef.current = undefined;
      pressedKeysRef.current.clear();
    }

    await sendKeyUp();
  }

  async function sendKeyDown(event: KeyboardEvent) {
    const code = KeyboardCodes.get(event.code);
    if (!code) return;

    const ctrl = getCtrl(event);
    const keys = [0x00, 0x00, code, 0x00, 0x00, 0x00];

    await device.sendKeyboardData(ctrl, keys);
  }

  async function sendKeyUp() {
    const modifiers = new Modifiers();
    const keys = [0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
    await device.sendKeyboardData(modifiers, keys);
  }

  function getCtrl(event: KeyboardEvent) {
    const modifiers = new Modifiers();

    if (event.ctrlKey) {
      modifiers.leftCtrl = pressedKeysRef.current.has('ControlLeft');
      modifiers.rightCtrl = pressedKeysRef.current.has('ControlRight');
    }
    if (event.shiftKey) {
      modifiers.leftShift = pressedKeysRef.current.has('ShiftLeft');
      modifiers.rightShift = pressedKeysRef.current.has('ShiftRight');
    }
    if (event.altKey) {
      modifiers.leftAlt = pressedKeysRef.current.has('AltLeft');
      modifiers.rightAlt = pressedKeysRef.current.has('AltRight');
    }
    if (event.metaKey) {
      modifiers.leftWindows = pressedKeysRef.current.has('MetaLeft');
      modifiers.rightWindows = pressedKeysRef.current.has('MetaRight');
    }
    if (event.getModifierState('AltGraph')) {
      modifiers.leftCtrl = true;
      modifiers.rightAlt = true;
    }

    return modifiers;
  }

  return <></>;
};
