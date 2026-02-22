import { useRef } from 'react';
import { InputNumber } from 'antd';
import { useAtom } from 'jotai';
import { ZapIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { pasteSpeedAtom } from '@/jotai/keyboard.ts';
import * as storage from '@/libs/storage';

export const PasteSpeedSetting = () => {
  const { t } = useTranslation();
  const [speed, setSpeed] = useAtom(pasteSpeedAtom);
  const holdStartTime = useRef<number>(0);
  const holdInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  function handleChange(value: number | null) {
    if (value !== null && value >= 1 && value <= 200) {
      setSpeed(value);
      storage.setPasteSpeed(value);
    }
  }

  function getStep(): number {
    const elapsed = Date.now() - holdStartTime.current;
    if (elapsed > 5000) return 15;
    if (elapsed > 3000) return 5;
    return 1;
  }

  function startHold(direction: 'up' | 'down') {
    holdStartTime.current = Date.now();
    
    const update = () => {
      const step = getStep();
      setSpeed((prev) => {
        const newValue = direction === 'up' 
          ? Math.min(200, prev + step)
          : Math.max(1, prev - step);
        storage.setPasteSpeed(newValue);
        return newValue;
      });
    };

    update();
    holdInterval.current = setInterval(update, 150);
  }

  function stopHold() {
    if (holdInterval.current) {
      clearInterval(holdInterval.current);
      holdInterval.current = null;
    }
  }

  return (
    <div className="flex h-[32px] items-center space-x-2 rounded px-3 text-neutral-300">
      <ZapIcon size={16} />
      <span className="text-sm">{t('settings.pasteSpeed.title', 'Paste Speed')}:</span>
      <div 
        className="paste-speed-input"
        onMouseDown={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest('.ant-input-number-handler-up')) {
            e.preventDefault();
            startHold('up');
          } else if (target.closest('.ant-input-number-handler-down')) {
            e.preventDefault();
            startHold('down');
          }
        }}
        onMouseUp={stopHold}
        onMouseLeave={stopHold}
      >
        <InputNumber
          value={speed}
          onChange={handleChange}
          min={1}
          max={200}
          size="small"
          className="w-[125px]"
          addonAfter="ms"
        />
      </div>
    </div>
  );
};
