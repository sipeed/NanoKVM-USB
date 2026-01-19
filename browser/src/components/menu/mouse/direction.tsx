import { ReactElement } from 'react';
import { Popover } from 'antd';
import clsx from 'clsx';
import { useAtom } from 'jotai';
import { ArrowDownUpIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { scrollDirectionAtom } from '@/jotai/mouse.ts';
import * as storage from '@/libs/storage';

export const Direction = (): ReactElement => {
  const { t } = useTranslation();

  const [scrollDirection, setScrollDirection] = useAtom(scrollDirectionAtom);

  const directions = [
    { name: t('mouse.scrollUp'), value: '-1' },
    { name: t('mouse.scrollDown'), value: '1' }
  ];

  function update(direction: string): void {
    const value = Number(direction);

    setScrollDirection(value);
    storage.setMouseScrollDirection(value);
  }

  const content = (
    <>
      {directions.map((direction) => (
        <div
          key={direction.value}
          className={clsx(
            'my-1 flex cursor-pointer items-center space-x-1 rounded py-1 pl-2 pr-5 hover:bg-neutral-700/50',
            direction.value === scrollDirection.toString() ? 'text-blue-500' : 'text-neutral-300'
          )}
          onClick={() => update(direction.value)}
        >
          {direction.name}
        </div>
      ))}
    </>
  );

  return (
    <Popover content={content} placement="rightTop" arrow={false} align={{ offset: [13, 0] }}>
      <div className="flex h-[32px] cursor-pointer items-center space-x-2 rounded px-3 text-neutral-300 hover:bg-neutral-700/50">
        <ArrowDownUpIcon size={16} />
        <span>{t('mouse.direction')}</span>
      </div>
    </Popover>
  );
};
