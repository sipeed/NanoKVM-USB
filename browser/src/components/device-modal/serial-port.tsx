import { useEffect } from 'react';
import { Button } from 'antd';
import { useAtom } from 'jotai';
import { useTranslation } from 'react-i18next';

import { serialStateAtom } from '@/jotai/device.ts';
import { device } from '@/libs/device';

type SerialPortProps = {
  onDisconnect: () => void;
  setErrMsg: (msg: string) => void;
};

export const SerialPort = ({ setErrMsg, onDisconnect }: SerialPortProps) => {
  const { t } = useTranslation();

  const [serialState, setSerialState] = useAtom(serialStateAtom);

  useEffect(() => {
    const isWebSerialSupported = 'serial' in navigator;
    if (!isWebSerialSupported) {
      setSerialState('notSupported');
    }
  }, [setSerialState]);

  const selectSerialPort = async () => {
    if (serialState === 'connecting') return;
    setSerialState('connecting');
    setErrMsg('');

    try {
      const port = await navigator.serial.requestPort();
      await device.serialPort.init({ port, onDisconnect });

      setSerialState('connected');
    } catch (err) {
      console.log(err);
      setSerialState('disconnected');
      setErrMsg(t('serial.failed'));
    }
  };

  if (serialState === 'notSupported') {
    return null;
  }

  return (
    <Button
      type={serialState === 'connected' ? 'primary' : 'default'}
      className="w-[250px]"
      loading={serialState === 'connecting'}
      onClick={selectSerialPort}
    >
      {t('modal.selectSerial')}
    </Button>
  );
};
