import { useState } from 'react';
import { CpuIcon, Loader2Icon } from 'lucide-react';

import { device } from '@/libs/device';

export const SerialPort = () => {
  const [isLoading, setIsLoading] = useState(false);

  async function selectSerial() {
    if (isLoading) return;
    setIsLoading(true);

    try {
      const port = await navigator.serial.requestPort();
      await device.serialPort.init({ port });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-center text-neutral-300" onClick={selectSerial}>
      <div className="flex h-[28px] w-[28px] cursor-pointer items-center justify-center rounded text-neutral-300 hover:bg-neutral-700/70 hover:text-white">
        {isLoading ? <Loader2Icon className="animate-spin" size={18} /> : <CpuIcon size={18} />}
      </div>
    </div>
  );
};
