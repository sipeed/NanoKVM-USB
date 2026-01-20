import { useEffect, useRef } from 'react';
import { useAtomValue } from 'jotai';

import { isKeyboardEnableAtom } from '@/jotai/keyboard';
import { getOperatingSystem } from '@/libs/browser';
import { device } from '@/libs/device';
import { KeyboardReport } from '@/libs/keyboard/keyboard.ts';
import { isModifier } from '@/libs/keyboard/keymap.ts';

interface AltGrState {
  active: boolean;
  ctrlLeftTimestamp: number;
}

const ALTGR_THRESHOLD_MS = 10;

export const Keyboard = () => {
  const isKeyboardEnabled = useAtomValue(isKeyboardEnableAtom);

  const keyboardRef = useRef(new KeyboardReport());
  const pressedKeys = useRef(new Set<string>());
  const altGrState = useRef<AltGrState | null>(null);
  const isComposing = useRef(false);

  useEffect(() => {
    if (getOperatingSystem() === 'Windows' && !altGrState.current) {
      altGrState.current = { active: false, ctrlLeftTimestamp: 0 };
    }

    if (!isKeyboardEnabled) {
      releaseKeys();
      return;
    }

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    document.addEventListener('compositionstart', handleCompositionStart);
    document.addEventListener('compositionend', handleCompositionEnd);
    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Key down event
    async function handleKeyDown(event: KeyboardEvent): Promise<void> {
      if (!isKeyboardEnabled) return;

      // Skip during IME composition
      if (isComposing.current || event.isComposing) return;

      event.preventDefault();
      event.stopPropagation();

      const code = event.code;
      if (pressedKeys.current.has(code)) {
        return;
      }

      // When AltGr is pressed, browsers send ControlLeft followed immediately by AltRight
      if (altGrState.current) {
        if (code === 'ControlLeft') {
          altGrState.current.ctrlLeftTimestamp = event.timeStamp;
        } else if (code === 'AltRight') {
          const timeDiff = event.timeStamp - altGrState.current.ctrlLeftTimestamp;
          if (timeDiff < ALTGR_THRESHOLD_MS && pressedKeys.current.has('ControlLeft')) {
            pressedKeys.current.delete('ControlLeft');
            handleKeyEvent({ type: 'keyup', code: 'ControlLeft' });
            altGrState.current.active = true;
          }
        }
      }

      pressedKeys.current.add(code);
      await handleKeyEvent({ type: 'keydown', code });
    }

    // Key up event
    async function handleKeyUp(event: KeyboardEvent): Promise<void> {
      if (!isKeyboardEnabled) return;

      if (isComposing.current || event.isComposing) return;

      event.preventDefault();
      event.stopPropagation();

      const code = event.code;

      // Handle AltGr state for Windows
      if (altGrState.current?.active) {
        if (code === 'ControlLeft') return;

        if (code === 'AltRight') {
          altGrState.current.active = false;
        }
      }

      // Compatible with macOS's command key combinations
      if (code === 'MetaLeft' || code === 'MetaRight') {
        const keysToRelease: string[] = [];
        pressedKeys.current.forEach((pressedCode) => {
          if (!isModifier(pressedCode)) {
            keysToRelease.push(pressedCode);
          }
        });

        for (const key of keysToRelease) {
          await handleKeyEvent({ type: 'keyup', code: key });
          pressedKeys.current.delete(key);
        }
      }

      pressedKeys.current.delete(code);
      await handleKeyEvent({ type: 'keyup', code });
    }

    // Composition start event
    function handleCompositionStart(): void {
      isComposing.current = true;
    }

    // Composition end event
    function handleCompositionEnd(): void {
      isComposing.current = false;
    }

    // Release all keys when window loses focus
    async function handleBlur(): Promise<void> {
      await releaseKeys();
    }

    // Release all keys before window closes
    async function handleVisibilityChange(): Promise<void> {
      if (document.hidden) {
        await releaseKeys();
      }
    }

    // Release all keys
    async function releaseKeys(): Promise<void> {
      for (const code of pressedKeys.current) {
        await handleKeyEvent({ type: 'keyup', code });
      }

      pressedKeys.current.clear();

      // Reset AltGr state
      if (altGrState.current) {
        altGrState.current.active = false;
        altGrState.current.ctrlLeftTimestamp = 0;
      }

      const report = keyboardRef.current.reset();
      await device.sendKeyboardData(report);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
      document.removeEventListener('compositionstart', handleCompositionStart);
      document.removeEventListener('compositionend', handleCompositionEnd);
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);

      releaseKeys();
    };
  }, [isKeyboardEnabled]);

  // Keyboard handler
  async function handleKeyEvent(event: { type: 'keydown' | 'keyup'; code: string }): Promise<void> {
    const kb = keyboardRef.current;
    const report = event.type === 'keydown' ? kb.keyDown(event.code) : kb.keyUp(event.code);
    await device.sendKeyboardData(report);
  }

  return <></>;
};
