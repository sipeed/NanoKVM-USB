import { useEffect, useState } from 'react';
import { Button, Divider, InputNumber, Modal, Popover } from 'antd';
import clsx from 'clsx';
import { useAtom, useSetAtom } from 'jotai';
import { MonitorIcon, Trash2Icon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { resolutionAtom } from '@/jotai/device.ts';
import { isKeyboardEnableAtom } from '@/jotai/keyboard.ts';
import { camera } from '@/libs/media/camera.ts';
import * as storage from '@/libs/storage';
import type { Resolution as VideoResolution } from '@/types';

export const Resolution = () => {
  const { t } = useTranslation();
  const setIsKeyboardEnable = useSetAtom(isKeyboardEnableAtom);
  const [resolution, setResolution] = useAtom(resolutionAtom);

  const [isOpen, setIsOpen] = useState(false);
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const [customResolutions, setCustomResolutions] = useState<VideoResolution[]>([]);

  const resolutions: VideoResolution[] = [
    { width: 3840, height: 2160 },
    { width: 2560, height: 1440 },
    { width: 1920, height: 1080 },
    { width: 1280, height: 720 },
    { width: 800, height: 600 },
    { width: 640, height: 480 }
  ];

  useEffect(() => {
    const resolutions = storage.getCustomResolutions();
    if (resolutions) {
      setCustomResolutions(resolutions);
    }
  }, []);

  useEffect(() => {
    setIsKeyboardEnable(!isOpen);
  }, [isOpen]);

  function showModal() {
    setWidth(0);
    setHeight(0);
    setIsOpen(true);
  }

  function submit() {
    if (!width || !height || (width === resolution.width && height === resolution.height)) {
      setIsOpen(false);
      return;
    }

    let isExist = resolutions.some((r) => r.width === width && r.height === height);
    if (isExist) return;
    isExist = customResolutions.some((r) => r.width === width && r.height === height);
    if (isExist) return;

    setCustomResolutions([...customResolutions, { width, height }]);
    storage.setCustomResolution(width, height);

    updateResolution(width, height);
  }

  async function updateResolution(w: number, h: number) {
    try {
      await camera.updateResolution(w, h);
    } catch (err) {
      console.log(err);
      return;
    }

    const video = document.getElementById('video') as HTMLVideoElement;
    if (!video) return;
    video.srcObject = camera.getStream();

    setResolution({ width: w, height: h });
    storage.setVideoResolution(w, h);
    setIsOpen(false);
  }

  function removeCustomResolution(e: any) {
    e.stopPropagation();

    const isExist = customResolutions.some(
      (r) => r.width === resolution.width && r.height === resolution.height
    );
    if (isExist) {
      updateResolution(1920, 1080);
    }

    setCustomResolutions([]);
    storage.removeCustomResolutions();
  }

  const content = (
    <>
      {/* resolution list */}
      {resolutions.map((res) => (
        <div
          key={res.width}
          className={clsx(
            'flex cursor-pointer select-none items-center space-x-1 rounded px-4 py-1.5 hover:bg-neutral-700/60',
            resolution.width === res.width && resolution.height === res.height
              ? 'text-blue-500'
              : 'text-white'
          )}
          onClick={() => updateResolution(res.width, res.height)}
        >
          <span className="flex w-[32px]">{res.width}</span>
          <span>x</span>
          <span className="w-[32px]">{res.height}</span>
        </div>
      ))}

      <Divider style={{ margin: '5px 0 5px 0' }} />

      {/* custom resolution */}
      <div
        className="flex cursor-pointer select-none items-center justify-between space-x-3 rounded px-4 py-1.5 text-sm hover:bg-neutral-700/60"
        onClick={showModal}
      >
        <span>{t('video.customResolution')}</span>
        {customResolutions.length > 0 && (
          <span className="hover:text-red-500" onClick={removeCustomResolution}>
            <Trash2Icon size={14} />
          </span>
        )}
      </div>

      {customResolutions.map((res) => (
        <div
          key={res.width}
          className={clsx(
            'flex cursor-pointer select-none items-center space-x-1 rounded px-4 py-1.5 hover:bg-neutral-700/60',
            resolution.width === res.width && resolution.height === res.height
              ? 'text-blue-500'
              : 'text-white'
          )}
          onClick={() => updateResolution(res.width, res.height)}
        >
          <span className="flex w-[32px]">{res.width}</span>
          <span>x</span>
          <span className="w-[32px]">{res.height}</span>
        </div>
      ))}
    </>
  );

  return (
    <>
      <Popover content={content} placement="rightTop" arrow={false} align={{ offset: [13, 0] }}>
        <div className="flex h-[32px] cursor-pointer items-center space-x-2 rounded px-3 text-neutral-300 hover:bg-neutral-700/50">
          <MonitorIcon size={16} />
          <span className="select-none text-sm">{t('video.resolution')}</span>
        </div>
      </Popover>

      <Modal
        open={isOpen}
        title={t('video.custom.title')}
        footer={null}
        closable={false}
        destroyOnHidden
      >
        <div className="flex flex-col items-center justify-center space-y-5 py-10">
          <div className="flex items-center space-x-5">
            <span className="text-sm">{t('video.custom.width')}</span>
            <InputNumber
              min={1}
              controls={false}
              defaultValue={resolution.width}
              onChange={(value) => setWidth(value || 0)}
            />
          </div>

          <div className="flex items-center space-x-5">
            <span className="text-sm">{t('video.custom.height')}</span>
            <InputNumber
              min={1}
              controls={false}
              defaultValue={resolution.height}
              onChange={(value) => setHeight(value || 0)}
            />
          </div>

          <div className="flex space-x-5">
            <Button type="primary" className="w-20" onClick={submit}>
              {t('video.custom.confirm')}
            </Button>
            <Button type="default" className="w-20" onClick={() => setIsOpen(false)}>
              {t('video.custom.cancel')}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
};
