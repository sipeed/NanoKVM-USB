import { ReactElement, useEffect } from 'react';
import { Popover } from 'antd';
import clsx from 'clsx';
import { useAtom } from 'jotai';
import { PercentIcon, ScalingIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { videoScaleAtom } from '@/jotai/device.ts';
import * as storage from '@/libs/storage';

export const Scale = (): ReactElement => {
  const { t } = useTranslation();

  const [videoScale, setVideoScale] = useAtom(videoScaleAtom);

  const ScaleList = [
    { label: t('video.auto'), value: 0 },
    { label: '200', value: 2 },
    { label: '150', value: 1.5 },
    { label: '100', value: 1 },
    { label: '75', value: 0.75 },
    { label: '50', value: 0.5 }
  ];

  useEffect(() => {
    const scale = storage.getVideoScale();
    if (scale) {
      setVideoScale(scale);
    }
  }, []);

  async function updateScale(scale: number): Promise<void> {
    setVideoScale(scale);
    storage.setVideoScale(scale);
  }

  const content = (
    <>
      {ScaleList.map((item) => (
        <div
          key={item.value}
          className={clsx(
            'flex cursor-pointer select-none items-center space-x-0.5 rounded px-5 py-1.5 hover:bg-neutral-700/60',
            item.value === videoScale ? 'text-blue-500' : 'text-white'
          )}
          onClick={() => updateScale(item.value)}
        >
          <span>{item.label}</span>
          {item.value > 0 && <PercentIcon size={12} />}
        </div>
      ))}
    </>
  );

  return (
    <Popover content={content} placement="rightTop" arrow={false} align={{ offset: [13, 0] }}>
      <div className="flex h-[32px] cursor-pointer items-center space-x-2 rounded px-3 text-neutral-300 hover:bg-neutral-700/50">
        <div className="flex size-[18px] items-center justify-center">
          <ScalingIcon size={16} />
        </div>
        <span>{t('video.scale')}</span>
      </div>
    </Popover>
  );
};
