import { useEffect, useRef, useState } from 'react';
import { Modal, Progress } from 'antd';
import { useAtom, useAtomValue } from 'jotai';
import { atom } from 'jotai';
import { useTranslation } from 'react-i18next';

import { pasteSpeedAtom } from '@/jotai/keyboard';
import { device } from '@/libs/device';
import { getLayoutById, LayoutMap } from '@/libs/keyboard/layouts';
import { ModifierBits } from '@/libs/keyboard/keymap';

// Paste state atom
export const pasteStateAtom = atom<{
  isOpen: boolean;
  text: string;
  layoutId: string;
  isPasting: boolean;
  progress: number;
  currentChar: number;
  totalChars: number;
}>({
  isOpen: false,
  text: '',
  layoutId: 'auto',
  isPasting: false,
  progress: 0,
  currentChar: 0,
  totalChars: 0
});

// Request to show paste dialog
export function requestPaste(text: string, layoutId: string, setState: (state: any) => void) {
  setState({
    isOpen: true,
    text,
    layoutId,
    isPasting: false,
    progress: 0,
    currentChar: 0,
    totalChars: text.length
  });
}

export const PasteDialog = () => {
  const { t } = useTranslation();
  const [state, setState] = useAtom(pasteStateAtom);
  const pasteSpeed = useAtomValue(pasteSpeedAtom);
  const cancelRef = useRef(false);
  const [estimatedTime, setEstimatedTime] = useState(0);

  useEffect(() => {
    // Estimate time based on speed setting (key down + key up delay)
    const msPerChar = pasteSpeed + Math.ceil(pasteSpeed / 2);
    setEstimatedTime(Math.ceil(state.text.length * msPerChar / 1000));
  }, [state.text, pasteSpeed]);

  // Focus the OK button when dialog opens
  useEffect(() => {
    if (state.isOpen && !state.isPasting) {
      // Small delay to ensure modal is rendered
      const timer = setTimeout(() => {
        const okButton = document.querySelector('.ant-modal-footer .ant-btn-primary') as HTMLButtonElement;
        if (okButton) {
          okButton.focus();
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [state.isOpen, state.isPasting]);

  const handleCancel = () => {
    if (state.isPasting) {
      cancelRef.current = true;
    } else {
      setState((prev) => ({ ...prev, isOpen: false, text: '' }));
    }
  };

  const handleConfirm = async () => {
    cancelRef.current = false;
    setState((prev) => ({ ...prev, isPasting: true, progress: 0, currentChar: 0 }));

    const layout: LayoutMap = getLayoutById(state.layoutId);
    const text = state.text;
    const keyDownDelay = pasteSpeed;
    const keyUpDelay = Math.ceil(pasteSpeed / 2);

    // Release all keys first - send multiple times to ensure clean state
    await device.sendKeyboardData([0, 0, 0, 0, 0, 0, 0, 0]);
    await new Promise((r) => setTimeout(r, 50));
    await device.sendKeyboardData([0, 0, 0, 0, 0, 0, 0, 0]);
    await new Promise((r) => setTimeout(r, 50));

    for (let i = 0; i < text.length; i++) {
      if (cancelRef.current) {
        // Release all keys on cancel
        await device.sendKeyboardData([0, 0, 0, 0, 0, 0, 0, 0]);
        setState((prev) => ({ ...prev, isOpen: false, isPasting: false, text: '' }));
        return;
      }

      const char = text[i];
      const mapping = layout[char];

      if (mapping) {
        let modifier = 0;
        if (mapping.shift) modifier |= ModifierBits.LeftShift;
        if (mapping.altGr) modifier |= ModifierBits.RightAlt;

        console.log(`Paste char '${char}' code=0x${mapping.code.toString(16)} mod=0x${modifier.toString(16)} shift=${!!mapping.shift} altGr=${!!mapping.altGr}`);

        // For modified keys (Shift/AltGr), press modifier first, then key
        // This is more compatible with Windows login screen and other sensitive inputs
        if (modifier !== 0) {
          // Press modifier first
          await device.sendKeyboardData([modifier, 0, 0, 0, 0, 0, 0, 0]);
          await new Promise((r) => setTimeout(r, Math.max(keyDownDelay, 20)));
        }
        
        // Press key (with modifier held)
        await device.sendKeyboardData([modifier, 0, mapping.code, 0, 0, 0, 0, 0]);
        await new Promise((r) => setTimeout(r, keyDownDelay));

        // Release key (modifier still held)
        if (modifier !== 0) {
          await device.sendKeyboardData([modifier, 0, 0, 0, 0, 0, 0, 0]);
          await new Promise((r) => setTimeout(r, Math.max(keyUpDelay, 15)));
        }
        
        // Release modifier
        await device.sendKeyboardData([0, 0, 0, 0, 0, 0, 0, 0]);
        if (mapping.altGr) {
          // Extra release for AltGr
          await new Promise((r) => setTimeout(r, keyUpDelay));
          await device.sendKeyboardData([0, 0, 0, 0, 0, 0, 0, 0]);
        }
        await new Promise((r) => setTimeout(r, keyUpDelay));

        // For dead keys, send space to produce the standalone character
        if (mapping.deadKey) {
          // Space key down
          await device.sendKeyboardData([0, 0, 0x2c, 0, 0, 0, 0, 0]);
          await new Promise((r) => setTimeout(r, keyDownDelay));
          // Space key up
          await device.sendKeyboardData([0, 0, 0, 0, 0, 0, 0, 0]);
          await new Promise((r) => setTimeout(r, keyUpDelay));
        }
      }

      // Update progress
      const progress = Math.round(((i + 1) / text.length) * 100);
      setState((prev) => ({ ...prev, progress, currentChar: i + 1 }));
    }

    setState((prev) => ({ ...prev, isOpen: false, isPasting: false, text: '' }));
  };

  const previewText = state.text.length > 200 
    ? state.text.substring(0, 200) + '...' 
    : state.text;

  return (
    <Modal
      title={state.isPasting ? t('keyboard.pasting', 'Pasting...') : t('keyboard.confirmPaste', 'Confirm Paste')}
      open={state.isOpen}
      onOk={handleConfirm}
      onCancel={handleCancel}
      okText={state.isPasting ? undefined : t('keyboard.paste', 'Paste')}
      cancelText={state.isPasting ? t('keyboard.stop', 'Stop') : t('keyboard.cancel', 'Cancel')}
      okButtonProps={{ disabled: state.isPasting, style: state.isPasting ? { display: 'none' } : {}, autoFocus: true }}
      cancelButtonProps={{ danger: state.isPasting }}
      closable={!state.isPasting}
      maskClosable={!state.isPasting}
      keyboard={!state.isPasting}
    >
      {!state.isPasting ? (
        <div className="space-y-3">
          <div className="text-sm text-neutral-400">
            {t('keyboard.pastePreview', 'Text to paste')} ({state.text.length} {t('keyboard.characters', 'characters')}, ~{estimatedTime}s):
          </div>
          <pre className="max-h-48 overflow-auto rounded bg-neutral-800 p-3 text-sm text-neutral-200 whitespace-pre-wrap break-all">
            {previewText}
          </pre>
        </div>
      ) : (
        <div className="space-y-3">
          <Progress percent={state.progress} status="active" />
          <div className="text-center text-sm text-neutral-400">
            {state.currentChar} / {state.totalChars} {t('keyboard.characters', 'characters')}
          </div>
          <div className="text-center text-xs text-neutral-500">
            {t('keyboard.pressStopToCancel', 'Press Stop to cancel')}
          </div>
        </div>
      )}
    </Modal>
  );
};
