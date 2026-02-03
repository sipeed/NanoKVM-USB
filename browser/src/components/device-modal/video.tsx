import { useEffect, useState } from 'react';
import { Select } from 'antd';
import { useAtom, useAtomValue } from 'jotai';
import { useTranslation } from 'react-i18next';

import { resolutionAtom, videoDeviceIdAtom, videoStateAtom } from '@/jotai/device.ts';
import { camera } from '@/libs/media/camera';
import * as storage from '@/libs/storage';
import type { MediaDevice } from '@/types';

type VideoProps = {
  setErrMsg: (msg: string) => void;
};

export const Video = ({ setErrMsg }: VideoProps) => {
  const { t } = useTranslation();

  const resolution = useAtomValue(resolutionAtom);
  const [videoDeviceId, setVideoDeviceId] = useAtom(videoDeviceIdAtom);
  const [videoState, setVideoState] = useAtom(videoStateAtom);

  const [devices, setDevices] = useState<MediaDevice[]>([]);

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
      setErrMsg(t('camera.failed'));
    }
  }

  async function selectVideo(videoId: string) {
    if (videoState === 'connecting') return;

    if (!videoId) {
      setVideoDeviceId('');
      return;
    }

    const device = devices.find((d) => d.videoId === videoId);
    if (!device) {
      return;
    }

    setVideoState('connecting');
    setErrMsg('');

    try {
      await camera.open(videoId, resolution.width, resolution.height, device.audioId);
    } catch (err) {
      console.log(err);
      setErrMsg(t('camera.failed'));
    }

    const video = document.getElementById('video') as HTMLVideoElement;
    if (!video) return;

    video.srcObject = camera.getStream();

    setVideoState('connected');
    setVideoDeviceId(videoId);
    storage.setVideoDevice(videoId);
  }

  return (
    <Select
      value={videoDeviceId || undefined}
      style={{ width: 250 }}
      options={devices}
      fieldNames={{
        value: 'videoId',
        label: 'videoName'
      }}
      allowClear={true}
      loading={videoState === 'connecting'}
      placeholder={t('modal.selectVideo')}
      onChange={selectVideo}
      onClick={getDevices}
    />
  );
};
