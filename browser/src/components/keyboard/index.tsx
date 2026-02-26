import { useEffect, useRef } from 'react';
import { useAtomValue } from 'jotai';

import { pasteStateAtom } from '@/components/paste-dialog';
import { isKeyboardEnableAtom } from '@/jotai/keyboard';
import { getOperatingSystem } from '@/libs/browser';
import { device } from '@/libs/device';
import { KeyboardReport } from '@/libs/keyboard/keyboard.ts';
import { isModifier } from '@/libs/keyboard/keymap.ts';
import { learnFromKeyEvent } from '@/libs/keyboard/layouts.ts';

interface AltGrState {
  active: boolean;
  ctrlLeftTimestamp: number;
}

const ALTGR_THRESHOLD_MS = 10;

export const Keyboard = () => {
  const os = getOperatingSystem();
  const isKeyboardEnabled = useAtomValue(isKeyboardEnableAtom);
  const pasteState = useAtomValue(pasteStateAtom);

  const keyboardRef = useRef(new KeyboardReport());
  const pressedKeys = useRef(new Set<string>());
  const altGrState = useRef<AltGrState | null>(null);
  const isComposing = useRef(false);

  // Track whether keyboard should be active (use ref to avoid closure issues)
  const shouldCaptureRef = useRef(true);
  const wasCaptureDisabled = useRef(false);
  const newShouldCapture = isKeyboardEnabled && !pasteState.isOpen;
  
  // Detect when capture is re-enabled (dialog closed)
  if (newShouldCapture && !shouldCaptureRef.current) {
    wasCaptureDisabled.current = true;
  }
  shouldCaptureRef.current = newShouldCapture;

  useEffect(() => {
    if (os === 'Windows' && !altGrState.current) {
      altGrState.current = { active: false, ctrlLeftTimestamp: 0 };
    }

    // Clear state when capture was disabled and is now re-enabled
    if (wasCaptureDisabled.current) {
      wasCaptureDisabled.current = false;
      pressedKeys.current.clear();
      keyboardRef.current.reset();
    }

    // Release keys when disabling
    if (!shouldCaptureRef.current) {
      releaseKeys();
    }

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    document.addEventListener('compositionstart', handleCompositionStart);
    document.addEventListener('compositionend', handleCompositionEnd);
    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Key down event
    async function handleKeyDown(event: KeyboardEvent): Promise<void> {
      // When capture is disabled (dialog open), let browser handle events naturally
      if (!shouldCaptureRef.current) {
        return;
      }

      // Skip during IME composition
      if (isComposing.current || event.isComposing) return;

      event.preventDefault();
      event.stopPropagation();

      const code = normalizeKeyCode(event, os);
      if (!code || pressedKeys.current.has(code)) {
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

      // Learn character mappings for paste feature
      learnFromKeyEvent(event);

      await handleKeyEvent({ type: 'keydown', code });
    }

    // Key up event
    async function handleKeyUp(event: KeyboardEvent): Promise<void> {
      // When capture is disabled (dialog open), let browser handle events naturally
      if (!shouldCaptureRef.current) {
        return;
      }

      if (isComposing.current || event.isComposing) return;

      event.preventDefault();
      event.stopPropagation();

      const code = normalizeKeyCode(event, os);

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
  }, [isKeyboardEnabled, pasteState.isOpen]);

  function normalizeKeyCode(event: KeyboardEvent, os?: string): string {
    if (event.code) {
      return event.code;
    }

    // Fallback: use event.key + event.location to determine the key
    // event.location: 1 = left, 2 = right, 0 = standard (non-positional)
    if (event.key === 'Shift') {
      if (event.location === 0 && os === 'Windows') {
        return 'ShiftRight';
      }
      return event.location === 2 ? 'ShiftRight' : 'ShiftLeft';
    }

    if (event.key === 'Control') {
      return event.location === 2 ? 'ControlRight' : 'ControlLeft';
    }
    if (event.key === 'Alt') {
      return event.location === 2 ? 'AltRight' : 'AltLeft';
    }
    if (event.key === 'Meta') {
      return event.location === 2 ? 'MetaRight' : 'MetaLeft';
    }

    return event.code;
  }

  // Keyboard handler
  async function handleKeyEvent(event: { type: 'keydown' | 'keyup'; code: string }): Promise<void> {
    const kb = keyboardRef.current;
    const report = event.type === 'keydown' ? kb.keyDown(event.code) : kb.keyUp(event.code);
    await device.sendKeyboardData(report);
  }

  return <></>;
};
