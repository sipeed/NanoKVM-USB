import { ReactElement, useEffect, useRef, useState } from 'react'
import { message, Result, Spin } from 'antd'
import clsx from 'clsx'
import { useAtom, useAtomValue } from 'jotai'
import { useTranslation } from 'react-i18next'
import { useMediaQuery } from 'react-responsive'

import { IpcEvents } from '@common/ipc-events'
import { Device } from '@renderer/components/device'
import { Keyboard } from '@renderer/components/keyboard'
import { Menu } from '@renderer/components/menu'
import { Mouse } from '@renderer/components/mouse'
import { VirtualKeyboard } from '@renderer/components/virtual-keyboard'
import {
  captureDeviceAtom,
  captureModeAtom,
  resolutionAtom,
  serialPortStateAtom,
  sharpnessAtom,
  videoScaleAtom,
  videoStateAtom
} from '@renderer/jotai/device'
import { isKeyboardEnableAtom } from '@renderer/jotai/keyboard'
import { mouseModeAtom, mouseStyleAtom } from '@renderer/jotai/mouse'
import { captureCamera } from '@renderer/libs/capture/capture-camera'
import { camera } from '@renderer/libs/media/camera'
import { requestCameraPermission } from '@renderer/libs/media/permission'
import * as storage from '@renderer/libs/storage'
import type { Resolution } from '@renderer/types'

type State = 'loading' | 'success' | 'failed'

const App = (): ReactElement => {
  const { t } = useTranslation()
  const isBigScreen = useMediaQuery({ minWidth: 850 })

  const videoScale = useAtomValue(videoScaleAtom)
  const [videoState, setVideoState] = useAtom(videoStateAtom)
  const [captureMode, setCaptureMode] = useAtom(captureModeAtom)
  const [captureDevice, setCaptureDevice] = useAtom(captureDeviceAtom)
  const [sharpness, setSharpness] = useAtom(sharpnessAtom)
  const serialPortState = useAtomValue(serialPortStateAtom)
  const mouseMode = useAtomValue(mouseModeAtom)
  const mouseStyle = useAtomValue(mouseStyleAtom)
  const isKeyboardEnable = useAtomValue(isKeyboardEnableAtom)
  const [resolution, setResolution] = useAtom(resolutionAtom)

  const [state, setState] = useState<State>('loading')
  const [captureNonce, setCaptureNonce] = useState(0)
  const prevCaptureMode = useRef(false)

  useEffect(() => {
    const resolution = storage.getVideoResolution()
    if (resolution) {
      setResolution(resolution)
    }

    setCaptureMode(storage.getCaptureMode())
    setCaptureDevice(storage.getCaptureDevice())
    setSharpness(storage.getSharpness())
    requestMediaPermissions(resolution)

    return (): void => {
      camera.close()
      captureCamera.close()
      window.electron.ipcRenderer.invoke(IpcEvents.CLOSE_SERIAL_PORT)
    }
  }, [])

  // Drive the uncompressed-capture path when capture mode is on.
  // Depends on `resolution` so a resolution change cleanly restarts the session.
  useEffect(() => {
    if (state !== 'success') return

    const wasCapture = prevCaptureMode.current
    prevCaptureMode.current = captureMode

    if (captureMode) {
      camera.close()
      const canvas = document.getElementById('video') as HTMLCanvasElement | null
      if (!canvas) return
      captureCamera
        .open({
          canvas,
          width: resolution.width,
          height: resolution.height,
          fps: fpsFor(resolution.width, resolution.height),
          deviceName: captureDevice || undefined,
          sharpness,
          onError: (msg) => {
            if (/video mode changed/i.test(msg)) {
              // HDMI source resolution changed — restart at the new mode
              setTimeout(() => setCaptureNonce((n) => n + 1), 500)
            } else {
              failCapture(msg)
            }
          }
        })
        .then(() => setVideoState('connected'))
        .catch((err) => failCapture(err instanceof Error ? err.message : String(err)))
      return (): void => captureCamera.close()
    }

    captureCamera.close()
    // Ticked -> unticked: restore the regular getUserMedia camera (the swapped-in
    // <video> element has no stream otherwise).
    if (wasCapture) reopenCamera()
    return
  }, [captureMode, state, resolution, captureDevice, captureNonce])

  // Uncompressed frames are structured-clone copied across processes; past
  // ~150 MB/s the copies crowd out input IPC on both event loops (1080p60 is
  // ~250 MB/s and keyboard/mouse go unresponsive). Highest fps within budget:
  // 720p -> 60, 1080p -> 30. The device only offers 10/20/30/50/60.
  function fpsFor(width: number, height: number): number {
    const budget = 150e6
    return [60, 50, 30, 20, 10].find((fps) => width * height * 2 * fps <= budget) || 10
  }

  // A capture failure must not kill the UI — report it and fall back to the
  // regular camera path; serial (keyboard/mouse) is unaffected.
  function failCapture(msg: string): void {
    console.error('capture error:', msg)
    message.error(`${t('video.captureFailed')}: ${msg.slice(0, 300)}`, 8)
    setCaptureMode(false)
    storage.setCaptureMode(false)
  }

  async function reopenCamera(): Promise<void> {
    const videoId = storage.getVideoDevice()
    if (!videoId) return
    try {
      await camera.open(videoId, resolution.width, resolution.height, camera.audioId || undefined)
      const video = document.getElementById('video') as HTMLVideoElement | null
      if (!video) return
      video.srcObject = camera.getStream()
      setVideoState('connected')
    } catch (err) {
      console.error('camera reopen failed:', err)
      setVideoState('disconnected')
    }
  }

  async function requestMediaPermissions(resolution?: Resolution): Promise<void> {
    try {
      const granted = await requestCameraPermission(resolution)
      setState(granted ? 'success' : 'failed')
    } catch (err) {
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
      <Device />

      {videoState === 'connected' && serialPortState === 'connected' && (
        <>
          <Menu />
          {/* Remount on capture toggle so listeners re-bind to the swapped
              <video>/<canvas> element (same id, different DOM node). */}
          <Mouse key={captureMode ? 'mouse-canvas' : 'mouse-video'} />
          {isKeyboardEnable && <Keyboard key={captureMode ? 'kbd-canvas' : 'kbd-video'} />}
        </>
      )}

      {captureMode ? (
        <canvas
          id="video"
          className={clsx(
            'block max-h-full min-h-[480px] max-w-full min-w-[640px] origin-center object-scale-down select-none',
            videoState === 'connected' ? 'opacity-100' : 'opacity-0',
            mouseMode === 'relative' ? 'cursor-none' : mouseStyle
          )}
          style={{ transform: `scale(${videoScale})` }}
        />
      ) : (
        <video
          id="video"
          className={clsx(
            'block max-h-full min-h-[480px] max-w-full min-w-[640px] origin-center object-scale-down select-none',
            videoState === 'connected' ? 'opacity-100' : 'opacity-0',
            mouseMode === 'relative' ? 'cursor-none' : mouseStyle
          )}
          style={{ transform: `scale(${videoScale})` }}
          autoPlay
          playsInline
        />
      )}

      <VirtualKeyboard isBigScreen={isBigScreen} />
    </>
  )
}

export default App
