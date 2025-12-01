import { useEffect, useRef } from 'react';
import { device } from '@/libs/device';
import { Modifiers } from '@/libs/device/keyboard.ts';
import { KeyboardCodes } from '@/libs/keyboard';

export const Keyboard = () => {
  const MAX_SIMULTANEOUS_KEYS = 4;
  const modifierKeys = new Set(['Control', 'Shift', 'Alt', 'Meta']);
  const commonKeysRef = useRef<Set<number>>(new Set());
  const modifierKeysRef = useRef<Set<string>>(new Set());

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

    if (modifierKeys.has(event.key)) {
      modifierKeysRef.current.add(event.code);
    } else {
      const commonKeyCode = KeyboardCodes.get(event.code);
      if (
        commonKeyCode !== undefined &&
        !commonKeysRef.current.has(commonKeyCode) &&
        commonKeysRef.current.size < MAX_SIMULTANEOUS_KEYS
      ) {
        commonKeysRef.current.add(commonKeyCode);
      }
    }

    await sendKeyData(event);
  }

  // release button
  async function handleKeyUp(event: KeyboardEvent) {
    event.preventDefault();
    event.stopPropagation();

    if (modifierKeys.has(event.key)) {
      modifierKeysRef.current.delete(event.code);
    } else {
      const commonKeyCode = KeyboardCodes.get(event.code);
      if (
        commonKeyCode !== undefined &&
        commonKeysRef.current.has(commonKeyCode)
      ) {
        commonKeysRef.current.delete(commonKeyCode);
      }
    }

    await sendKeyData(event);
  }

  async function sendKeyData(event: KeyboardEvent) {
    const ctrl = getCtrl(event);
    const keys = [
      0x00, 0x00,
      ...Array.from(commonKeysRef.current),
      ...new Array(MAX_SIMULTANEOUS_KEYS - commonKeysRef.current.size).fill(0x00)
    ];

    await device.sendKeyboardData(ctrl, keys);
  }

  function getCtrl(event: KeyboardEvent) {
    const modifiers = new Modifiers();

    if (event.ctrlKey) {
      modifiers.leftCtrl = modifierKeysRef.current.has('ControlLeft');
      modifiers.rightCtrl = modifierKeysRef.current.has('ControlRight');
    }
    if (event.shiftKey) {
      modifiers.leftShift = modifierKeysRef.current.has('ShiftLeft');
      modifiers.rightShift = modifierKeysRef.current.has('ShiftRight');
    }
    if (event.altKey) {
      modifiers.leftAlt = modifierKeysRef.current.has('AltLeft');
      modifiers.rightAlt = modifierKeysRef.current.has('AltRight');
    }
    if (event.metaKey) {
      modifiers.leftWindows = modifierKeysRef.current.has('MetaLeft');
      modifiers.rightWindows = modifierKeysRef.current.has('MetaRight');
    }
    if (event.getModifierState('AltGraph')) {
      modifiers.leftCtrl = true;
      modifiers.rightAlt = true;
    }

    return modifiers;
  }

  return <></>;
};
