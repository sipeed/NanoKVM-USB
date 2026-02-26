import { Popover } from 'antd';
import { useAtomValue } from 'jotai';
import { MonitorIcon } from 'lucide-react';

import { menuConfigAtom } from '@/jotai/device';
import type { VideoSubItemId } from '@/libs/menu-config';

import { Device } from './device.tsx';
import { Resolution } from './resolution.tsx';
import { Rotation } from './rotation.tsx';
import { Scale } from './scale.tsx';

const VIDEO_SUB_COMPONENTS: Record<VideoSubItemId, React.FC> = {
  'video.resolution': Resolution,
  'video.rotation': Rotation,
  'video.scale': Scale,
  'video.device': Device,
};

export const Video = () => {
  const menuConfig = useAtomValue(menuConfigAtom);

  const content = (
    <div className="flex flex-col space-y-0.5">
      {menuConfig.subMenus.video.map((itemId) => {
        const Component = VIDEO_SUB_COMPONENTS[itemId];
        return Component ? <Component key={itemId} /> : null;
      })}
    </div>
  );

  return (
    <Popover content={content} placement="bottomLeft" trigger="click" arrow={false}>
      <div className="flex h-[28px] w-[28px] cursor-pointer items-center justify-center rounded text-neutral-300 hover:bg-neutral-700/70 hover:text-white">
        <MonitorIcon size={18} />
      </div>
    </Popover>
  );
};
