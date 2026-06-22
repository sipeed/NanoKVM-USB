import { useEffect, useRef } from 'react';
import { Button } from 'antd';
import { useAtom } from 'jotai';
import { useTranslation } from 'react-i18next';

import { serialStateAtom } from '@/jotai/device.ts';
import { device } from '@/libs/device';
import * as storage from '@/libs/storage';

type SerialPortProps = {
  onDisconnect: () => void;
  setErrMsg: (msg: string) => void;
};

export const SerialPort = ({ setErrMsg, onDisconnect }: SerialPortProps) => {
  const { t } = useTranslation();

  const [serialState, setSerialState] = useAtom(serialStateAtom);
  const autoConnectAttempted = useRef(false);

  useEffect(() => {
    const isWebSerialSupported = 'serial' in navigator;
    if (!isWebSerialSupported) {
      setSerialState('notSupported');
      return;
    }

    if (!autoConnectAttempted.current) {
      autoConnectAttempted.current = true;
      tryAutoConnect();
    }
  }, [setSerialState]);

  async function tryAutoConnect() {
    const savedPort = storage.getSerialPort();
    if (!savedPort) return;

    try {
      const grantedPorts = await navigator.serial.getPorts();
      const match = grantedPorts.find((port) => {
        const info = port.getInfo();
        return (
          savedPort.vendorId != null &&
          savedPort.productId != null &&
          info.usbVendorId === savedPort.vendorId &&
          info.usbProductId === savedPort.productId
        );
      });

      if (match) {
        setSerialState('connecting');
        await device.serialPort.init({ port: match, onDisconnect });
        setSerialState('connected');
      }
    } catch (err) {
      console.log('Auto-connect serial failed:', err);
    }
  }

  const selectSerialPort = async () => {
    if (serialState === 'connecting') return;
    setSerialState('connecting');
    setErrMsg('');

    try {
      const savedPort = storage.getSerialPort();
      const filters = savedPort?.vendorId != null
        ? [{ usbVendorId: savedPort.vendorId, usbProductId: savedPort.productId }]
        : [];

      const port = await navigator.serial.requestPort(filters.length ? { filters } : undefined);
      await device.serialPort.init({ port, onDisconnect });

      const info = port.getInfo();
      storage.setSerialPort(info.usbVendorId, info.usbProductId);

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
