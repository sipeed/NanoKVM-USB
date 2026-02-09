import { useEffect, useState } from 'react';
import { Button, Modal } from 'antd';
import { useSetAtom } from 'jotai';
import { VolumeOffIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { videoDeviceIdAtom, videoStateAtom } from '@/jotai/device.ts';
import { camera } from '@/libs/media/camera.ts';
import { checkPermission, requestMicrophonePermission } from '@/libs/media/permission.ts';

export const Audio = () => {
  const { t } = useTranslation();

  const setVideoState = useSetAtom(videoStateAtom);
  const setVideoDeviceId = useSetAtom(videoDeviceIdAtom);

  const [isGranted, setIsGranted] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    checkPermission('microphone').then((granted) => {
      setIsGranted(granted);
    });
  }, []);

  async function requestPermission() {
    try {
      const granted = await requestMicrophonePermission();
      if (!granted) {
        setIsModalOpen(true);
        return;
      }

      setVideoDeviceId('');
      setVideoState('disconnected');
      setIsGranted(granted);

      camera.close();
    } catch (err: any) {
      console.log('failed to request media permissions: ', err);
    }
  }

  function closeModal() {
    setIsModalOpen(false);
  }

  if (isGranted) {
    return null;
  }

  return (
    <>
      <div
        className="flex h-[28px] w-[28px] cursor-pointer items-center justify-center rounded text-neutral-300 hover:bg-neutral-700/70 hover:text-white"
        onClick={requestPermission}
      >
        <VolumeOffIcon size={18} />
      </div>

      <Modal open={isModalOpen} title={t('audio.tip')} footer={null} onCancel={closeModal}>
        <div className="whitespace-pre-line py-5">{t('audio.permission')}</div>
        <a
          href="https://wiki.sipeed.com/hardware/en/kvm/NanoKVM_USB/quick_start.html#Authorization"
          target="_blank"
        >
          {t('audio.viewDoc')}
        </a>

        <div className="flex w-full justify-center pt-8">
          <Button type="primary" className="min-w-20" onClick={closeModal}>
            {t('audio.ok')}
          </Button>
        </div>
      </Modal>
    </>
  );
};
