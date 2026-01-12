import { useEffect, useState } from 'react';
import { Modal } from 'antd';
import { useAtomValue } from 'jotai';
import { useTranslation } from 'react-i18next';

import { serialStateAtom, videoStateAtom } from '@/jotai/device.ts';

import { SerialPort } from './serial-port';
import { Video } from './video';

export const DeviceModal = () => {
  const { t } = useTranslation();

  const videoState = useAtomValue(videoStateAtom);
  const serialState = useAtomValue(serialStateAtom);

  const [isOpen, setIsOpen] = useState(false);
  const [errMsg, setErrMsg] = useState('');

  useEffect(() => {
    if (videoState === 'connected') {
      if (serialState === 'notSupported' || serialState === 'connected') {
        setIsOpen(false);
        return;
      }
    }

    setIsOpen(true);
  }, [videoState, serialState]);

  return (
    <Modal open={isOpen} title={t('modal.title')} footer={null} closable={false} destroyOnHidden>
      <div className="flex flex-col items-center justify-center space-y-5 py-10">
        <Video setErrMsg={setErrMsg} />
        <SerialPort setErrMsg={setErrMsg} />

        {errMsg && <span className="text-xs text-red-500">{errMsg}</span>}
      </div>
    </Modal>
  );
};
