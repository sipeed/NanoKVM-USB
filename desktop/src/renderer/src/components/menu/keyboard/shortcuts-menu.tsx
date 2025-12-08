import { useEffect, useState } from 'react';
import { Button, Divider, Popover } from 'antd';
import { SendHorizonal, Trash } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ShortcutProps } from '@renderer/libs/device/keyboard';
import { Shortcut } from './shortcut';
import { KeyboardShortcutCustom } from './shortcut-custom';
import { getShortcuts, setShortcuts } from '@renderer/libs/storage';

export const KeyboardShortcutsMenu = () => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [storedShortcuts, setStoredShortcuts] = useState<ShortcutProps[]>([]);
  const predefinedShortcuts : ShortcutProps[] = [
    {
      label: t('keyboard.shortcut.ctrlAltDel'),
      modifiers: { leftCtrl: true, leftAlt: true },
      keyCode: 'Delete',
    },
    {
      label: t('keyboard.shortcut.ctrlD'),
      modifiers: { leftCtrl: true },
      keyCode: 'KeyD',
    },
    {
      label: t('keyboard.shortcut.winTab'),
      modifiers: { leftWindows: true },
      keyCode: 'Tab',
    },
  ]

  const addShortcut = (shortcut: ShortcutProps) => {
    if (shortcut == null) return;
    const shortcuts = getShortcuts();
    shortcuts.push(shortcut);
    setStoredShortcuts(shortcuts);
    setShortcuts(shortcuts);
  }

  const removeShortcut = (indexToRemove: number) => {
    const newShortcuts = storedShortcuts.filter(
      (_, index) => index !== indexToRemove
    );
    setStoredShortcuts(newShortcuts);
    setShortcuts(newShortcuts);
  }

  useEffect(() => {
    const shortcuts = getShortcuts();
    if (shortcuts.length === 0) {
      predefinedShortcuts.forEach(shortcut => {
        addShortcut(shortcut);
      })
    } else {
      setStoredShortcuts(shortcuts);
    }
  }, []);

  return (
    <Popover
      content={
        <div className="flex flex-col gap-1">
          {storedShortcuts.map((shortcut, index) => (
            <>
              <Shortcut
                key={index}
                label={shortcut.label}
                modifiers={shortcut.modifiers}
                keyCode={shortcut.keyCode}
              >
                <Button
                  className="ml-auto"
                  type="text"
                  danger
                  icon={<Trash size={16} />}
                  onClick={() => {removeShortcut(index)}}
                />
              </Shortcut>
            </>
          ))}
          <Divider style={{ margin: '5px 0 5px 0' }} />
          <KeyboardShortcutCustom
            addShortcut={addShortcut}/>
        </div>
      }
      trigger="click"
      placement="rightTop"
      align={{ offset: [14, 0] }}
      open={open}
      onOpenChange={setOpen}
      arrow={false}
    >
      <div className="flex h-[30px] cursor-pointer items-center space-x-1 rounded px-3 text-neutral-300 hover:bg-neutral-700/60">
        <SendHorizonal size={18} />
        <span>{t('keyboard.shortcut.title')}</span>
      </div>
    </Popover>
  );
};
