import { useEffect, useRef } from 'react';
import { device } from '@/libs/device';
import { Modifiers } from '@/libs/device/keyboard.ts';
import { KeyboardCodes } from '@/libs/keyboard';

export const Keyboard = () => {
  const MAX_SIMULTANEOUS_KEYS = 4;
  const modifierKeys = new Set(['Control', 'Shift', 'Alt', 'Meta']);
  const pressedKeysRef = useRef<Set<number>>(new Set());
  const pressedModifiersRef = useRef<Set<string>>(new Set());

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
      pressedModifiersRef.current.add(event.code);
    } else {
      const keyCode = KeyboardCodes.get(event.code);
      if (
        keyCode !== undefined &&
        !pressedKeysRef.current.has(keyCode) &&
        pressedKeysRef.current.size < MAX_SIMULTANEOUS_KEYS
      ) {
        pressedKeysRef.current.add(keyCode);
      }
    }

    await sendKeyData(event);
  }

  // release button
  async function handleKeyUp(event: KeyboardEvent) {
    event.preventDefault();
    event.stopPropagation();

    if (modifierKeys.has(event.key)) {
      pressedModifiersRef.current.delete(event.code);
    } else {
      const commonKeyCode = KeyboardCodes.get(event.code);
      if (
        commonKeyCode !== undefined &&
        pressedKeysRef.current.has(commonKeyCode)
      ) {
        pressedKeysRef.current.delete(commonKeyCode);
      }
    }

    await sendKeyData(event);
  }

  async function sendKeyData(event: KeyboardEvent) {
    const modifiers = getModifiers(event);
    const keys = [
      0x00, 0x00,
      ...Array.from(pressedKeysRef.current),
      ...new Array(MAX_SIMULTANEOUS_KEYS - pressedKeysRef.current.size).fill(0x00)
    ];

    await device.sendKeyboardData(modifiers, keys);
  }

  function getModifiers(event: KeyboardEvent) {
    const modifiers = new Modifiers();

    if (event.ctrlKey) {
      modifiers.leftCtrl = pressedModifiersRef.current.has('ControlLeft');
      modifiers.rightCtrl = pressedModifiersRef.current.has('ControlRight');
    }
    if (event.shiftKey) {
      modifiers.leftShift = pressedModifiersRef.current.has('ShiftLeft');
      modifiers.rightShift = pressedModifiersRef.current.has('ShiftRight');
    }
    if (event.altKey) {
      modifiers.leftAlt = pressedModifiersRef.current.has('AltLeft');
      modifiers.rightAlt = pressedModifiersRef.current.has('AltRight');
    }
    if (event.metaKey) {
      modifiers.leftWindows = pressedModifiersRef.current.has('MetaLeft');
      modifiers.rightWindows = pressedModifiersRef.current.has('MetaRight');
    }
    if (event.getModifierState('AltGraph')) {
      modifiers.leftCtrl = true;
      modifiers.rightAlt = true;
    }

    return modifiers;
  }

  return <></>;
};
