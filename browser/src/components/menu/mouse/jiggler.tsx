import { useEffect } from 'react';
import { Popover } from 'antd';
import clsx from 'clsx';
import { useAtom } from 'jotai';
import { MousePointerClickIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { mouseJigglerModeAtom } from '@/jotai/mouse.ts';
import { mouseJiggler } from '@/libs/mouse-jiggler';
import * as storage from '@/libs/storage';

export const Jiggler = () => {
  const { t } = useTranslation();
  const [jigglerMode, setJigglerMode] = useAtom(mouseJigglerModeAtom);

  const mouseJigglerModes: { name: string; value: 'enable' | 'disable' }[] = [
    { name: t('mouse.jiggler.enable'), value: 'enable' },
    { name: t('mouse.jiggler.disable'), value: 'disable' }
  ];

  function update(mode: 'enable' | 'disable'): void {
    storage.setMouseJigglerMode(mode);
    setJigglerMode(mode);
  }

  useEffect(() => {
    mouseJiggler.setMode(jigglerMode);
  }, [jigglerMode]);

  const content = (
    <>
      {mouseJigglerModes.map((mode) => (
        <div
          key={mode.value}
          className={clsx(
            'my-1 flex cursor-pointer items-center space-x-1 rounded py-1 pl-2 pr-5 hover:bg-neutral-700/50',
            mode.value === jigglerMode ? 'text-blue-500' : 'text-neutral-300'
          )}
          onClick={() => update(mode.value)}
        >
          {mode.name}
        </div>
      ))}
    </>
  );

  return (
    <Popover content={content} placement="rightTop" arrow={false} align={{ offset: [13, 0] }}>
      <div className="flex h-[32px] cursor-pointer items-center space-x-2 rounded px-3 text-neutral-300 hover:bg-neutral-700/50">
        <MousePointerClickIcon size={16} />
        <span>{t('mouse.jiggler.title')}</span>
      </div>
    </Popover>
  );
};
