import { ReactElement, useEffect, useRef, useState } from 'react'
import { Result, Spin } from 'antd'
import clsx from 'clsx'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { useTranslation } from 'react-i18next'
import { useMediaQuery } from 'react-responsive'

import { IpcEvents } from '@common/ipc-events'
import { DeviceModal } from '@renderer/components/device-modal'
import { Keyboard } from '@renderer/components/keyboard'
import { Menu } from '@renderer/components/menu'
import { Mouse } from '@renderer/components/mouse'
import { VirtualKeyboard } from '@renderer/components/virtual-keyboard'
import {
  resolutionAtom,
  serialPortStateAtom,
  videoRotateAtom,
  videoScaleAtom,
  videoStateAtom
} from '@renderer/jotai/device'
import { isKeyboardEnableAtom } from '@renderer/jotai/keyboard'
import { mouseStyleAtom } from '@renderer/jotai/mouse'
import { camera } from '@renderer/libs/camera'
import * as storage from '@renderer/libs/storage'
import type { Resolution } from '@renderer/types'

type State = 'loading' | 'success' | 'failed'

const App = (): ReactElement => {
  const { t } = useTranslation()
  const isBigScreen = useMediaQuery({ minWidth: 850 })

  const videoScale = useAtomValue(videoScaleAtom)
  const [videoRotate, setVideoRotate] = useAtom(videoRotateAtom)
  const videoState = useAtomValue(videoStateAtom)
  const serialPortState = useAtomValue(serialPortStateAtom)
  const mouseStyle = useAtomValue(mouseStyleAtom)
  const isKeyboardEnable = useAtomValue(isKeyboardEnableAtom)
  const setResolution = useSetAtom(resolutionAtom)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasContextRef = useRef<CanvasRenderingContext2D | null>(null)

  const [state, setState] = useState<State>('loading')
  const [isConnected, setIsConnected] = useState(false)

  const videoStyle = clsx(
    'block select-none origin-center max-w-full max-h-full object-scale-down',
    mouseStyle
  )

  const renderFrame = (frame: VideoFrame) => {
    const canvas = canvasRef.current
    const ctx = canvasContextRef.current
    if (!canvas || !ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    ctx.save()
    ctx.translate(canvas.width / 2, canvas.height / 2)
    ctx.rotate((videoRotate * Math.PI) / 180)

    ctx.drawImage(
      frame,
      -frame.displayWidth / 2,
      -frame.displayHeight / 2,
      frame.displayWidth,
      frame.displayHeight
    )

    ctx.restore()
  }

  const setCanvas = () => {
    const video = videoRef.current
    const canvas = canvasRef.current

    if (!video || !canvas || video.videoWidth === 0) return

    if (videoRotate % 180 === 0) {
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
    } else {
      canvas.width = video.videoHeight
      canvas.height = video.videoWidth
    }

    if (canvasRef.current !== null) {
      canvasContextRef.current = canvasRef.current.getContext('2d')
    }

    if (videoRotate !== 0) {
      processVideoFrames()
    }
  }

  const processVideoFrames = () => {
    const video = videoRef.current
    if (video == null || videoRotate === 0) return
    video.requestVideoFrameCallback(() => {
      const frame = new VideoFrame(video)
      renderFrame(frame)
      frame.close()
      processVideoFrames()
    })
  }

  useEffect(() => {
    if (videoRotate !== 0) {
      setCanvas()
    }
  }, [videoRotate])

  useEffect(() => {
    const rotate = storage.getVideoRotate()
    if (rotate) {
      setVideoRotate(rotate)
    }

    const resolution = storage.getVideoResolution()
    if (resolution) {
      setResolution(resolution)
    }

    requestMediaPermissions(resolution)

    return (): void => {
      camera.close()
      window.electron.ipcRenderer.invoke(IpcEvents.CLOSE_SERIAL_PORT)
    }
  }, [])

  useEffect(() => {
    setIsConnected(videoState === 'connected' && serialPortState === 'connected')
  }, [videoState, serialPortState])

  async function requestMediaPermissions(resolution?: Resolution): Promise<void> {
    try {
      if (window.electron.process.platform === 'darwin') {
        const res = await window.electron.ipcRenderer.invoke(IpcEvents.REQUEST_MEDIA_PERMISSIONS)

        if (!res.camera) {
          setState('failed')
          return
        }
      } else {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: resolution?.width || 1920 },
            height: { ideal: resolution?.height || 1080 }
          },
          audio: true
        })
        stream.getTracks().forEach((track) => track.stop())
      }

      setState('success')
    } catch (err) {
      console.log('failed to request media permissions: ', err)
      if (err instanceof Error && ['NotAllowedError', 'PermissionDeniedError'].includes(err.name)) {
        setState('failed')
      } else {
        setState('success')
      }
    }
  }

  if (state === 'loading') {
    return <Spin size="large" spinning={true} tip={t('camera.tip')} fullscreen />
  }

  if (state === 'failed') {
    return (
      <Result
        status="info"
        title={t('camera.denied')}
        extra={[
          <h2 key="desc" className="text-xl text-white">
            {t('camera.authorize')}
          </h2>
        ]}
      />
    )
  }

  return (
    <>
      {isConnected ? (
        <>
          <Menu />
          <Mouse />
          {isKeyboardEnable && <Keyboard />}
        </>
      ) : (
        <DeviceModal />
      )}

      <video
        id="video"
        className={clsx(videoRotate === 0 ? [videoStyle, 'min-h-[480px] min-w-[640px]'] : 'hidden')}
        ref={videoRef}
        autoPlay
        playsInline
        onLoadedMetadata={setCanvas}
      />

      {videoRotate !== 0 && (
        <canvas
          id="video-canvas"
          ref={canvasRef}
          className={videoStyle}
          style={{
            transform: `scale(${videoScale})`
          }}
        />
      )}

      <VirtualKeyboard isBigScreen={isBigScreen} />
    </>
  )
}

export default App
