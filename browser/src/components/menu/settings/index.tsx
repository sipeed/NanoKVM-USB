import { Popover } from 'antd';
import { useAtomValue } from 'jotai';
import { BookIcon, DownloadIcon, SettingsIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { menuConfigAtom } from '@/jotai/device';
import type { SettingsSubItemId } from '@/libs/menu-config';

import { Language } from './language.tsx';
import { MenuCustomization } from './menu-customization';

const SETTINGS_SUB_COMPONENTS: Record<SettingsSubItemId, React.FC> = {
  'settings.language': Language,
  'settings.menuCustomization': MenuCustomization,
};

export const Settings = () => {
  const { t } = useTranslation();
  const menuConfig = useAtomValue(menuConfigAtom);

  function openPage(url: string) {
    window.open(url, '_blank');
  }

  const content = (
    <div className="flex flex-col space-y-0.5">
      {menuConfig.subMenus.settings.map((itemId) => {
        const Component = SETTINGS_SUB_COMPONENTS[itemId];
        return Component ? <Component key={itemId} /> : null;
      })}

      <div
        className="flex h-[32px] cursor-pointer items-center space-x-2 rounded px-3 text-neutral-300 hover:bg-neutral-700/50"
        onClick={() => openPage('https://wiki.sipeed.com/nanokvmusb')}
      >
        <BookIcon size={16} />
        <span>{t('settings.document')}</span>
      </div>

      <div
        className="flex h-[32px] cursor-pointer items-center space-x-2 rounded px-3 text-neutral-300 hover:bg-neutral-700/50"
        onClick={() => openPage('https://github.com/sipeed/NanoKVM-USB/releases')}
      >
        <DownloadIcon size={16} />
        <span>{t('settings.download')}</span>
      </div>
    </div>
  );

  return (
    <Popover content={content} placement="bottomLeft" trigger="click" arrow={false}>
      <div className="flex h-[28px] w-[28px] cursor-pointer items-center justify-center rounded text-neutral-300 hover:bg-neutral-700/50 hover:text-white">
        <SettingsIcon size={18} />
      </div>
    </Popover>
  );
};
