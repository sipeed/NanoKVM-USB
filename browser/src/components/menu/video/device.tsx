import { useEffect, useState } from 'react';
import { Popover } from 'antd';
import clsx from 'clsx';
import { useAtom, useAtomValue } from 'jotai';
import { VideoIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { resolutionAtom, videoDeviceIdAtom } from '@/jotai/device.ts';
import { camera } from '@/libs/media/camera';
import * as storage from '@/libs/storage';
import type { MediaDevice } from '@/types';

export const Device = () => {
  const { t } = useTranslation();

  const resolution = useAtomValue(resolutionAtom);
  const [videoDeviceId, setVideoDeviceId] = useAtom(videoDeviceIdAtom);

  const [devices, setDevices] = useState<MediaDevice[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    getDevices();
  }, []);

  async function getDevices() {
    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = allDevices.filter((device) => device.kind === 'videoinput');
      const audioDevices = allDevices.filter((device) => device.kind === 'audioinput');

      const mediaDevices = videoDevices.map((videoDevice) => {
        const device: MediaDevice = {
          videoId: videoDevice.deviceId,
          videoName: videoDevice.label
        };

        if (videoDevice.groupId) {
          const matchedAudioDevice = audioDevices.find(
            (audioDevice) => audioDevice.groupId === videoDevice.groupId
          );
          if (matchedAudioDevice) {
            device.audioId = matchedAudioDevice.deviceId;
            device.audioName = matchedAudioDevice.label;
          }
        }

        return device;
      });

      setDevices(mediaDevices);
    } catch (err) {
      console.log(err);
    }
  }

  async function selectDevice(device: MediaDevice) {
    if (isLoading) return;
    setIsLoading(true);

    try {
      await camera.open(device.videoId, resolution.width, resolution.height, device.audioId);

      const video = document.getElementById('video') as HTMLVideoElement;
      if (!video) return;
      video.srcObject = camera.getStream();

      setVideoDeviceId(device.videoId);
      storage.setVideoDevice(device.videoId);
    } finally {
      setIsLoading(false);
    }
  }

  const content = (
    <>
      {devices.map((device) => (
        <div
          key={device.videoId}
          className={clsx(
            'max-w-[320px] cursor-pointer truncate rounded px-2 py-1.5 hover:bg-neutral-700/60',
            device.videoId === videoDeviceId ? 'text-blue-500' : 'text-white'
          )}
          onClick={() => selectDevice(device)}
        >
          {device.videoName}
        </div>
      ))}
    </>
  );

  return (
    <Popover content={content} placement="rightTop" arrow={false} align={{ offset: [13, 0] }}>
      <div className="flex h-[32px] cursor-pointer items-center space-x-2 rounded px-3 text-neutral-300 hover:bg-neutral-700/50">
        <VideoIcon size={16} />
        <span className="select-none text-sm">{t('video.device')}</span>
      </div>
    </Popover>
  );
};
