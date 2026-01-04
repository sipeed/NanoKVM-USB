import { ReactElement } from 'react';
import { Popover } from 'antd';
import clsx from 'clsx';
import { useAtom } from 'jotai';
import { RatioIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { videoRotationAtom } from '@/jotai/device.ts';
import * as storage from '@/libs/storage';
import { Rotation as VideoRotation } from '@/types.ts';

const RotationList: { label: string; value: VideoRotation }[] = [
  { label: '0°', value: 0 },
  { label: '90°', value: 90 },
  { label: '180°', value: 180 },
  { label: '270°', value: 270 }
];

export const Rotation = (): ReactElement => {
  const { t } = useTranslation();

  const [videoRotation, setVideoRotation] = useAtom(videoRotationAtom);

  function updateRotation(rotation: VideoRotation): void {
    setVideoRotation(rotation);
    storage.setVideoRotation(rotation);
  }

  const content = (
    <>
      {RotationList.map((item) => (
        <div
          key={item.value}
          className={clsx(
            'flex cursor-pointer select-none items-center space-x-0.5 rounded px-5 py-1.5 hover:bg-neutral-700/60',
            item.value === videoRotation ? 'text-blue-500' : 'text-white'
          )}
          onClick={() => updateRotation(item.value)}
        >
          <span>{item.label}</span>
        </div>
      ))}
    </>
  );

  return (
    <Popover content={content} placement="rightTop" arrow={false} align={{ offset: [13, 0] }}>
      <div className="flex h-[32px] cursor-pointer items-center space-x-2 rounded px-3 text-neutral-300 hover:bg-neutral-700/50">
        <div className="flex size-[18px] items-center justify-center">
          <RatioIcon size={16} />
        </div>
        <span>{t('video.rotation')}</span>
      </div>
    </Popover>
  );
};
