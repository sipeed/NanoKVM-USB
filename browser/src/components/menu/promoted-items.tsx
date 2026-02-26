import { useEffect, useState } from 'react';
import { Divider, Popover } from 'antd';
import { useSetAtom } from 'jotai';
import {
  MonitorIcon,
  RotateCwIcon,
  MaximizeIcon,
  VideoIcon,
  ClipboardIcon,
  KeyboardIcon,
  CommandIcon,
  MousePointerIcon,
  MousePointer2Icon,
  ArrowUpDownIcon,
  GaugeIcon,
  MousePointerClickIcon,
  LanguagesIcon,
  LayoutGridIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { ScrollArea } from '@/components/ui/scroll-area';
import { isKeyboardOpenAtom } from '@/jotai/keyboard';
import { device } from '@/libs/device';
import { CharCodes, ShiftChars } from '@/libs/keyboard/charCodes';
import { getModifierBit } from '@/libs/keyboard/keymap';
import type { SubMenuItemId } from '@/libs/menu-config';
import { getSubMenuItemMeta } from '@/libs/menu-config';
import * as storage from '@/libs/storage';

import { Recorder as ShortcutRecorder } from './keyboard/shortcuts/recorder';
import { Shortcut } from './keyboard/shortcuts/shortcut';
import type { Shortcut as ShortcutInterface } from './keyboard/shortcuts/types';
import { Resolution } from './video/resolution';
import { Rotation } from './video/rotation';
import { Scale } from './video/scale';
import { Device } from './video/device';
import { Style } from './mouse/style';
import { Mode } from './mouse/mode';
import { Direction } from './mouse/direction';
import { Speed } from './mouse/speed';
import { Jiggler } from './mouse/jiggler';
import { Language } from './settings/language';
import { MenuCustomization } from './settings/menu-customization';

// Icon mapping for each submenu item
const ITEM_ICONS: Record<SubMenuItemId, React.ReactNode> = {
  'video.resolution': <MonitorIcon size={18} />,
  'video.rotation': <RotateCwIcon size={18} />,
  'video.scale': <MaximizeIcon size={18} />,
  'video.device': <VideoIcon size={18} />,
  'keyboard.paste': <ClipboardIcon size={18} />,
  'keyboard.virtualKeyboard': <KeyboardIcon size={18} />,
  'keyboard.shortcuts': <CommandIcon size={18} />,
  'mouse.style': <MousePointerIcon size={18} />,
  'mouse.mode': <MousePointer2Icon size={18} />,
  'mouse.direction': <ArrowUpDownIcon size={18} />,
  'mouse.speed': <GaugeIcon size={18} />,
  'mouse.jiggler': <MousePointerClickIcon size={18} />,
  'settings.language': <LanguagesIcon size={18} />,
  'settings.menuCustomization': <LayoutGridIcon size={18} />,
};

// Components for popover items
const POPOVER_COMPONENTS: Partial<Record<SubMenuItemId, React.FC>> = {
  'video.resolution': Resolution,
  'video.rotation': Rotation,
  'video.scale': Scale,
  'video.device': Device,
  'mouse.style': Style,
  'mouse.mode': Mode,
  'mouse.direction': Direction,
  'mouse.speed': Speed,
  'mouse.jiggler': Jiggler,
  'settings.language': Language,
  'settings.menuCustomization': MenuCustomization,
};

const BUTTON_CLASS =
  'flex h-[28px] w-[28px] cursor-pointer items-center justify-center rounded text-neutral-300 hover:bg-neutral-700/70 hover:text-white';

// Promoted paste: direct clipboard-to-keyboard action
const PromotedPaste: React.FC<{ label: string }> = ({ label }) => {
  const [isLoading, setIsLoading] = useState(false);

  async function paste() {
    if (isLoading) return;
    setIsLoading(true);
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;
      for (const char of text) {
        const ascii = char.charCodeAt(0);
        const code = CharCodes[ascii];
        if (!code) continue;
        let modifier = 0;
        if ((ascii >= 65 && ascii <= 90) || ShiftChars[ascii]) {
          modifier |= getModifierBit('ShiftLeft');
        }
        await device.sendKeyboardData([modifier, 0, code, 0, 0, 0, 0, 0]);
        await new Promise((r) => setTimeout(r, 50));
        await device.sendKeyboardData([0, 0, 0, 0, 0, 0, 0, 0]);
      }
    } catch (e) {
      console.log(e);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className={BUTTON_CLASS} onClick={paste} title={label}>
      <ClipboardIcon size={18} />
    </div>
  );
};

// Promoted shortcuts: self-contained popover with shortcuts content
const PromotedShortcuts: React.FC<{ label: string }> = ({ label }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [customShortcuts, setCustomShortcuts] = useState<ShortcutInterface[]>([]);

  const defaultShortcuts: ShortcutInterface[] = [
    { keys: [{ code: 'MetaLeft', label: 'Win' }, { code: 'Tab', label: 'Tab' }] },
    { keys: [{ code: 'ControlLeft', label: 'Ctrl' }, { code: 'AltLeft', label: 'Alt' }, { code: 'Delete', label: '⌫' }] },
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

  function handleOpenChange(open: boolean) {
    if (open) { setIsOpen(true); return; }
    if (isRecording) return;
    setIsOpen(false);
  }

  const content = (
    <ScrollArea className="max-w-[400px] [&>[data-radix-scroll-area-viewport]]:max-h-[350px]">
      {customShortcuts.length > 0 && (
        <>
          {customShortcuts.map((shortcut, index) => (
            <Shortcut key={index} shortcut={shortcut} />
          ))}
          <Divider style={{ margin: '5px 0 5px 0' }} />
        </>
      )}
      {defaultShortcuts.map((shortcut, index) => (
        <Shortcut key={index} shortcut={shortcut} />
      ))}
      <Divider style={{ margin: '5px 0 5px 0' }} />
      <ShortcutRecorder
        shortcuts={customShortcuts}
        addShortcut={addShortcut}
        delShortcut={delShortcut}
        setIsRecording={setIsRecording}
      />
    </ScrollArea>
  );

  return (
    <Popover
      content={content}
      placement="bottomLeft"
      trigger="click"
      arrow={false}
      open={isOpen}
      onOpenChange={handleOpenChange}
    >
      <div className={BUTTON_CLASS} title={label}>
        <CommandIcon size={18} />
      </div>
    </Popover>
  );
};

interface PromotedSubMenuItemProps {
  itemId: SubMenuItemId;
}

export const PromotedSubMenuItem: React.FC<PromotedSubMenuItemProps> = ({ itemId }) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const setIsKeyboardOpen = useSetAtom(isKeyboardOpenAtom);

  const meta = getSubMenuItemMeta(itemId);
  if (!meta) return null;

  const icon = ITEM_ICONS[itemId];
  const label = t(meta.labelKey, meta.defaultLabel);

  // Special cases
  if (itemId === 'keyboard.virtualKeyboard') {
    return (
      <div className={BUTTON_CLASS} onClick={() => setIsKeyboardOpen((prev) => !prev)} title={label}>
        {icon}
      </div>
    );
  }

  if (itemId === 'keyboard.paste') {
    return <PromotedPaste label={label} />;
  }

  if (itemId === 'keyboard.shortcuts') {
    return <PromotedShortcuts label={label} />;
  }

  // Standard popover items
  const ContentComponent = POPOVER_COMPONENTS[itemId];
  if (!ContentComponent) return null;

  return (
    <Popover
      content={<ContentComponent />}
      placement="bottomLeft"
      trigger="click"
      arrow={false}
      open={isOpen}
      onOpenChange={setIsOpen}
    >
      <div className={BUTTON_CLASS} title={label}>
        {icon}
      </div>
    </Popover>
  );
};
