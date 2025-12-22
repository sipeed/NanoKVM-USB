import { useEffect, useState } from 'react';
import { Divider, Popover } from 'antd';
import { CommandIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { ScrollArea } from '@/components/ui/scroll-area';
import * as storage from '@/libs/storage';

import { Recorder } from './recorder.tsx';
import { Shortcut } from './shortcut.tsx';
import type { Shortcut as ShortcutInterface } from './types.ts';

export const Shortcuts = () => {
  const { t } = useTranslation();

  const [isOpen, setIsOpen] = useState(false);

  const [customShortcuts, setCustomShortcuts] = useState<ShortcutInterface[]>([]);

  const defaultShortcuts: ShortcutInterface[] = [
    {
      keys: [
        { code: 'MetaLeft', label: 'Win', isModifier: true },
        { code: 'Tab', label: 'Tab', isModifier: false }
      ]
    },
    {
      keys: [
        { code: 'ControlLeft', label: 'Ctrl', isModifier: true },
        { code: 'AltLeft', label: 'Alt', isModifier: true },
        { code: 'Delete', label: '⌫', isModifier: false }
      ]
    }
  ];

  useEffect(() => {
    const shortcuts = storage.getShortcuts();
    if (!shortcuts) return;
    setCustomShortcuts(JSON.parse(shortcuts));
  }, []);

  function addShortcut(shortcut: ShortcutInterface) {
    const shortcuts = [...customShortcuts, shortcut];
    setCustomShortcuts(shortcuts);
    storage.setShortcuts(JSON.stringify(shortcuts));
  }

  function delShortcut(index: number) {
    const shortcuts = customShortcuts.filter((_, i) => i !== index);
    setCustomShortcuts(shortcuts);
    storage.setShortcuts(JSON.stringify(shortcuts));
  }

  const content = (
    <ScrollArea className="max-w-[400px] [&>[data-radix-scroll-area-viewport]]:max-h-[350px]">
      {/* custom shortcuts */}
      {customShortcuts.length > 0 && (
        <>
          {customShortcuts.map((shortcut, index) => (
            <Shortcut key={index} shortcut={shortcut}></Shortcut>
          ))}

          <Divider style={{ margin: '5px 0 5px 0' }} />
        </>
      )}

      {/*  default shortcuts */}
      {defaultShortcuts.map((shortcut, index) => (
        <Shortcut key={index} shortcut={shortcut}></Shortcut>
      ))}

      <Divider style={{ margin: '5px 0 5px 0' }} />

      <Recorder shortcuts={customShortcuts} addShortcut={addShortcut} delShortcut={delShortcut} />
    </ScrollArea>
  );

  return (
    <Popover
      content={content}
      trigger="hover"
      placement="rightTop"
      align={{ offset: [14, 0] }}
      open={isOpen}
      onOpenChange={setIsOpen}
      arrow={false}
    >
      <div className="flex h-[32px] cursor-pointer items-center space-x-2 rounded px-3 text-neutral-300 hover:bg-neutral-700/50">
        <div className="flex size-[18px] items-center justify-center">
          <CommandIcon size={16} />
        </div>
        <span>{t('keyboard.shortcut.title')}</span>
      </div>
    </Popover>
  );
};
