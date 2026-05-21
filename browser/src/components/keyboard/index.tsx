import { useEffect, useRef } from 'react';
import { useAtomValue } from 'jotai';

import { isKeyboardEnableAtom, keyboardLayoutAtom } from '@/jotai/keyboard';
import { getOperatingSystem } from '@/libs/browser';
import { device } from '@/libs/device';
import { KeyboardReport } from '@/libs/keyboard/keyboard.ts';
import { getKeycode, isModifier } from '@/libs/keyboard/keymap.ts';
import { sendTextAsKeyboardReports } from '@/libs/keyboard/layout.ts';

interface AltGrState {
  active: boolean;
  ctrlLeftTimestamp: number;
}

const ALTGR_THRESHOLD_MS = 10;

export const Keyboard = () => {
  const os = getOperatingSystem();
  const isKeyboardEnabled = useAtomValue(isKeyboardEnableAtom);
  const keyboardLayout = useAtomValue(keyboardLayoutAtom);

  const keyboardRef = useRef(new KeyboardReport());
  const pressedKeys = useRef(new Set<string>());
  const altGrState = useRef<AltGrState | null>(null);
  const isComposing = useRef(false);

  useEffect(() => {
    if (os === 'Windows' && !altGrState.current) {
      altGrState.current = { active: false, ctrlLeftTimestamp: 0 };
    }

    if (!isKeyboardEnabled) {
      releaseKeys();
      return;
    }

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    document.addEventListener('paste', handlePaste);
    document.addEventListener('compositionstart', handleCompositionStart);
    document.addEventListener('compositionend', handleCompositionEnd);
    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Key down event
    async function handleKeyDown(event: KeyboardEvent): Promise<void> {
      if (!isKeyboardEnabled) return;

      // Skip during IME composition
      if (isComposing.current || event.isComposing) return;

      if (isPasteShortcut(event)) {
        event.preventDefault();
        event.stopPropagation();
        await pasteFromClipboard();
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const code = normalizeKeyCode(event, os);
      if (shouldTypePrintableFallback(event, code)) {
        await typeText(event.key);
        return;
      }

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
      await handleKeyEvent({ type: 'keydown', code });
    }

    // Key up event
    async function handleKeyUp(event: KeyboardEvent): Promise<void> {
      if (!isKeyboardEnabled) return;

      if (isComposing.current || event.isComposing) return;

      event.preventDefault();
      event.stopPropagation();

      const code = normalizeKeyCode(event, os);
      if (shouldTypePrintableFallback(event, code)) {
        return;
      }

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

    async function handlePaste(event: ClipboardEvent): Promise<void> {
      if (!isKeyboardEnabled) return;
      if (isComposing.current) return;

      event.preventDefault();
      event.stopPropagation();

      let text = event.clipboardData?.getData('text/plain');
      if (!text) {
        text = await navigator.clipboard.readText();
      }

      await typeText(text);
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

    async function pasteFromClipboard(): Promise<void> {
      try {
        const text = await navigator.clipboard.readText();
        await typeText(text);
      } catch (e) {
        console.log(e);
      }
    }

    async function typeText(text: string): Promise<void> {
      if (!text) return;

      await releaseKeys();
      await sendTextAsKeyboardReports(
        text,
        keyboardLayout,
        (report) => device.sendKeyboardData(report),
        50
      );
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
      document.removeEventListener('paste', handlePaste);
      document.removeEventListener('compositionstart', handleCompositionStart);
      document.removeEventListener('compositionend', handleCompositionEnd);
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);

      releaseKeys();
    };
  }, [isKeyboardEnabled, keyboardLayout]);

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

  function isPasteShortcut(event: KeyboardEvent): boolean {
    return (event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'v';
  }

  function shouldTypePrintableFallback(event: KeyboardEvent, code: string): boolean {
    return isPrintableKey(event.key) && (!code || (!isModifier(code) && getKeycode(code) === undefined));
  }

  function isPrintableKey(key: string): boolean {
    return Array.from(key).length === 1 || key === '\n' || key === '\t';
  }

  return <></>;
};
