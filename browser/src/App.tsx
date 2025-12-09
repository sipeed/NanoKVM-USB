import { useEffect, useRef, useState } from 'react';
import { Alert, Result, Spin } from 'antd';
import clsx from 'clsx';
import { useAtomValue, useSetAtom, useAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import { useMediaQuery } from 'react-responsive';
import { DeviceModal } from '@/components/device-modal';
import { Keyboard } from '@/components/keyboard';
import { Menu } from '@/components/menu';
import { Mouse } from '@/components/mouse';
import { VirtualKeyboard } from '@/components/virtual-keyboard';
import { resolutionAtom, serialStateAtom, videoRotateAtom, videoScaleAtom, videoStateAtom } from '@/jotai/device.ts';
import { isKeyboardEnableAtom } from '@/jotai/keyboard.ts';
import { mouseStyleAtom } from '@/jotai/mouse.ts';
import { camera } from '@/libs/camera';
import { device } from '@/libs/device';
import * as storage from '@/libs/storage';
import type { Resolution } from '@/types.ts';

const App = () => {
  const { t } = useTranslation();
  const isBigScreen = useMediaQuery({ minWidth: 850 });

  const mouseStyle = useAtomValue(mouseStyleAtom);
  const [videoScale, setVideoScale] = useAtom(videoScaleAtom);
  const [videoRotate, setVideoRotate] = useAtom(videoRotateAtom);
  const videoState = useAtomValue(videoStateAtom);
  const serialState = useAtomValue(serialStateAtom);
  const isKeyboardEnable = useAtomValue(isKeyboardEnableAtom);
  const setResolution = useSetAtom(resolutionAtom);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasContextRef = useRef<CanvasRenderingContext2D | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isCameraAvailable, setIsCameraAvailable] = useState(false);

  const videoStyle = clsx('block select-none origin-center max-w-full max-h-full object-scale-down', mouseStyle)

  const renderFrame = (frame: VideoFrame) => {
    const canvas = canvasRef.current;
    const ctx = canvasContextRef.current;
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((videoRotate * Math.PI) / 180);

    ctx.drawImage(
      frame,
      -frame.displayWidth / 2,
      -frame.displayHeight / 2,
      frame.displayWidth,
      frame.displayHeight
    );

    ctx.restore();
  };

  const setCanvas = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas || video.videoWidth === 0) return;

    if (videoRotate % 180 === 0) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    } else {
      canvas.width = video.videoHeight;
      canvas.height = video.videoWidth;
    }

    if (canvasRef.current !== null) {
      canvasContextRef.current = canvasRef.current.getContext('2d');
    }

    if (videoRotate !== 0) {
      processVideoFrames();
    }
  }

  const processVideoFrames = () => {
    const video = videoRef.current;
    if (video == null || videoRotate === 0) return;
    video.requestVideoFrameCallback(() => {
      const frame = new VideoFrame(video);
      renderFrame(frame);
      frame.close();
      processVideoFrames();
    })
  }

  useEffect(() => {
    if (videoRotate !== 0) {
      setCanvas();
    }
  }, [videoRotate]);

  useEffect(() => {
    const resolution = storage.getVideoResolution();
    if (resolution) {
      setResolution(resolution);
    }

    requestMediaPermissions(resolution);

    const rotate = storage.getVideoRotate();
    if (rotate) {
      setVideoRotate(rotate);
    }

    const scale = storage.getVideoScale();
    if (scale) {
      setVideoScale(scale);
    }

    return () => {
      camera.close();
      device.serialPort.close();
    };
  }, []);

  async function requestMediaPermissions(resolution?: Resolution) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: resolution?.width || 1920 },
          height: { ideal: resolution?.height || 1080 }
        },
        audio: true
      });
      stream.getTracks().forEach((track) => track.stop());

      setIsCameraAvailable(true);
    } catch (err: any) {
      console.log('failed to request media permissions: ', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setIsCameraAvailable(false);
      } else {
        setIsCameraAvailable(true);
      }
    }

    setIsLoading(false);
  }

  if (isLoading) {
    return <Spin size="large" spinning={isLoading} tip={t('camera.tip')} fullscreen />;
  }

  if (!isCameraAvailable) {
    return (
      <Result
        status="info"
        title={t('camera.denied')}
        extra={[<h2 className="text-xl text-white">{t('camera.authorize')}</h2>]}
      />
    );
  }

  return (
    <>
      <DeviceModal />

      {videoState === 'connected' && (
        <>
          <Menu />

          {serialState === 'notSupported' && (
            <Alert message={t('serial.notSupported')} type="warning" banner closable />
          )}

          {serialState === 'connected' && (
            <>
              <Mouse />
              {isKeyboardEnable && <Keyboard />}
            </>
          )}
        </>
      )}

      <video
        id="video"
        className={clsx(videoRotate === 0 ? [videoStyle, "min-h-[480px] min-w-[640px]"] : "hidden")}
        ref={videoRef}
        autoPlay
        playsInline
        onLoadedMetadata={setCanvas}
      />

      {videoRotate !== 0 &&
        <canvas
          id="video-canvas"
          ref={canvasRef}
          className={videoStyle}
          style={{
            transform: `scale(${videoScale})`,
          }}
        />
      }

      <VirtualKeyboard isBigScreen={isBigScreen} />
    </>
  );
};

export default App;
