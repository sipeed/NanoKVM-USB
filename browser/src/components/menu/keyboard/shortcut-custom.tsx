import { useEffect, useRef, useState } from 'react';
import { Input, InputRef, Modal, Space } from 'antd';
import { useSetAtom } from 'jotai';
import { KeyboardIcon, SquarePenIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { isKeyboardEnableAtom } from '@/jotai/keyboard.ts';
import { modifierKeys, Modifiers, ShortcutProps } from '@/libs/device/keyboard.ts';

interface KeyboardShortcutCustomProps {
  addShortcut: (shortcut: ShortcutProps) => void;
}

export const KeyboardShortcutCustom = ({ addShortcut }: KeyboardShortcutCustomProps) => {
  const { t } = useTranslation();
  const setIsKeyboardEnable = useSetAtom(isKeyboardEnableAtom);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isCapturingShortcut, setIsCapturingShortcut] = useState<boolean>(false);
  const [shortcut, setShortcut] = useState<ShortcutProps | null>(null);
  const [shortcutLabel, setShortcutLabel] = useState<string>('');
  const [shortcutFixedLabel, setShortcutFixedLabel] = useState<string>('');
  const pressedModifiersRef = useRef<Set<string>>(new Set());
  const inputRef = useRef<InputRef>(null);

  function getPressedShortcutString(event: KeyboardEvent) {
    let pressedKey: string = '';
    pressedKey += event.ctrlKey ? 'Ctrl + ' : '';
    pressedKey += event.shiftKey ? 'Shift + ' : '';
    pressedKey += event.altKey ? 'Alt + ' : '';
    pressedKey += event.metaKey ? 'Meta + ' : '';
    if (!modifierKeys.has(event.key)) {
      if (event.code.startsWith('Key') || event.code.startsWith('Digit')) {
        pressedKey += event.code.slice(-1);
      } else {
        pressedKey += event.key;
      }
    }
    return pressedKey;
  }

  function handleModelDone() {
    if (shortcut == null) {
      cleanShortcut();
      return;
    }
    addShortcut({
      modifiers: shortcut.modifiers,
      label: shortcutLabel == '' ? shortcutFixedLabel : shortcutLabel,
      keyCode: shortcut.keyCode
    });
    cleanShortcut();
  }

  function cleanShortcut() {
    setIsCapturingShortcut(false);
    setIsModalOpen(false);
    setShortcut(null);
    setShortcutLabel('');
    setShortcutFixedLabel('');
  }

  async function handleKeyDown(event: KeyboardEvent) {
    event.preventDefault();
    event.stopPropagation();

    const label = getPressedShortcutString(event);
    setShortcutFixedLabel(label);

    if (modifierKeys.has(event.key)) {
      if (event.type == 'keydown') {
        pressedModifiersRef.current.add(event.code);
      } else {
        pressedModifiersRef.current.delete(event.code);
      }
    } else {
      setIsCapturingShortcut(false);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyDown);
      const modifiers = Modifiers.getModifiers(event, pressedModifiersRef.current);
      const ret: ShortcutProps = {
        modifiers: modifiers,
        label: label,
        keyCode: event.code
      };
      setShortcut(ret);

    }
  }

  function handleFullscreen() {
    if (!document.fullscreenElement) {
      const element = document.documentElement;
      element.requestFullscreen().then();
      // @ts-expect-error - https://developer.mozilla.org/en-US/docs/Web/API/Keyboard/lock
      navigator.keyboard?.lock();
    }
  }

  useEffect(() => {
    setIsKeyboardEnable(!isModalOpen);
  }, [isModalOpen]);

  useEffect(() => {
    if (inputRef.current && !isCapturingShortcut) {
      inputRef.current.blur();
    }
  }, [isCapturingShortcut]);

  return (
    <>
      <div
        className="flex h-[30px] cursor-pointer items-center space-x-1 rounded px-3 text-neutral-300 hover:bg-neutral-700/60"
        onClick={() => {
          setIsModalOpen(true);
        }}
      >
        <span>{t('keyboard.shortcut.custom')}</span>
      </div>
      <Modal
        width={400}
        title={t('keyboard.shortcut.custom')}
        open={isModalOpen}
        onOk={handleModelDone}
        onCancel={cleanShortcut}
        okText={t('keyboard.shortcut.save')}
        cancelText={t('keyboard.shortcut.cancel')}>
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div className="flex">
            {t('keyboard.shortcut.captureTips')}
            <a onClick={handleFullscreen}>{t('keyboard.shortcut.enterFullScreen')}</a>
          </div>
          <Input
            ref={inputRef}
            placeholder={t('keyboard.shortcut.capture')}
            value={shortcutFixedLabel}
            prefix={<KeyboardIcon size={16} />}
            onFocus={() => {
              setIsCapturingShortcut(true);
              window.addEventListener('keydown', handleKeyDown);
              window.addEventListener('keyup', handleKeyDown);
            }}
            onBlur={() => {
              setIsCapturingShortcut(false);
              window.removeEventListener('keydown', handleKeyDown);
              window.removeEventListener('keyup', handleKeyDown);
            }}
          />

          <Input
            placeholder={shortcutFixedLabel || t('keyboard.shortcut.label')}
            value={shortcutLabel}
            prefix={<SquarePenIcon size={16} />}
            onChange={(e) => setShortcutLabel(e.target.value)}
          />

        </Space>
      </Modal>
    </>
  );
};
