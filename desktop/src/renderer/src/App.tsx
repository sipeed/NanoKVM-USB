import { ReactElement, useEffect, useMemo, useState } from 'react'
import { Result, Spin } from 'antd'
import clsx from 'clsx'
import { useAtomValue, useSetAtom } from 'jotai'
import { useTranslation } from 'react-i18next'
import { useMediaQuery } from 'react-responsive'

import { IpcEvents } from '@common/ipc-events'
import { Device } from '@renderer/components/device'
import { Keyboard } from '@renderer/components/keyboard'
import { Menu } from '@renderer/components/menu'
import { Mouse } from '@renderer/components/mouse'
import { VirtualKeyboard } from '@renderer/components/virtual-keyboard'
import {
  resolutionAtom,
  serialPortStateAtom,
  videoScaleAtom,
  videoStateAtom,
  maxResolutionModeAtom
} from '@renderer/jotai/device'
import { isKeyboardEnableAtom } from '@renderer/jotai/keyboard'
import { mouseModeAtom, mouseStyleAtom } from '@renderer/jotai/mouse'
import { startAutoClicker, stopAutoClicker } from '@renderer/libs/auto-clicker'
import { camera } from '@renderer/libs/media/camera'
import { requestCameraPermission } from '@renderer/libs/media/permission'
import { getAutoClickerMode, getVideoResolution, getMaxResolutionMode } from '@renderer/libs/storage'
import type { Resolution } from '@renderer/types'

type State = 'loading' | 'success' | 'failed'

const App = (): ReactElement => {
  const { t } = useTranslation()
  const isBigScreen = useMediaQuery({ minWidth: 850 })

  const videoScale = useAtomValue(videoScaleAtom)
  const videoState = useAtomValue(videoStateAtom)
  const serialPortState = useAtomValue(serialPortStateAtom)
  const mouseMode = useAtomValue(mouseModeAtom)
  const mouseStyle = useAtomValue(mouseStyleAtom)
  const isKeyboardEnable = useAtomValue(isKeyboardEnableAtom)
  const resolution = useAtomValue(resolutionAtom)
  const setResolution = useSetAtom(resolutionAtom)
  const setMaxResolutionMode = useSetAtom(maxResolutionModeAtom)

  const [state, setState] = useState<State>('loading')
  const [devicePixelRatio, setDevicePixelRatio] = useState<number>(window.devicePixelRatio || 1)
  const [videoDimensions, setVideoDimensions] = useState({ width: 2560, height: 1440 })

  // Monitor devicePixelRatio changes (for display scaling, moving between monitors)
  useEffect(() => {
    const updateDevicePixelRatio = (): void => {
      const newRatio = window.devicePixelRatio || 1
      console.log('[Retina] devicePixelRatio:', newRatio)
      setDevicePixelRatio(newRatio)
    }

    updateDevicePixelRatio()
    
    // Monitor for DPI changes (moving window between displays)
    const mediaQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', updateDevicePixelRatio)
      return () => mediaQuery.removeEventListener('change', updateDevicePixelRatio)
    }
  }, [])

  // Dynamically detect video stream resolution (fixes 4K blur)
  useEffect(() => {
    const video = document.getElementById('video') as HTMLVideoElement
    if (!video) return

    const updateDimensions = (): void => {
      if (video.videoWidth && video.videoHeight && 
          (video.videoWidth !== videoDimensions.width || video.videoHeight !== videoDimensions.height)) {
        console.log(
          `[Video Canvas] Updating: ${videoDimensions.width}x${videoDimensions.height} → ${video.videoWidth}x${video.videoHeight}`
        )
        console.log(
          `[Video Canvas] DPR=${window.devicePixelRatio} → canvas will be ${video.videoWidth * window.devicePixelRatio}x${video.videoHeight * window.devicePixelRatio}`
        )
        setVideoDimensions({
          width: video.videoWidth,
          height: video.videoHeight
        })
      }
    }

    // Listen for video metadata and resolution changes
    video.addEventListener('loadedmetadata', updateDimensions)
    video.addEventListener('resize', updateDimensions)
    
    // Check immediately if video is already loaded
    if (video.readyState >= 1) {
      updateDimensions()
    }

    return () => {
      video.removeEventListener('loadedmetadata', updateDimensions)
      video.removeEventListener('resize', updateDimensions)
    }
  }, [videoDimensions])

  // Debug: Log Retina canvas calculations
  useEffect(() => {
    console.log('[Retina Debug] videoDimensions:', videoDimensions)
    console.log('[Retina Debug] devicePixelRatio state:', devicePixelRatio)
    console.log('[Retina Debug] Canvas width will be:', videoDimensions.width * devicePixelRatio)
    console.log('[Retina Debug] Canvas height will be:', videoDimensions.height * devicePixelRatio)
  }, [videoDimensions, devicePixelRatio])

  useEffect(() => {
    const resolution = getVideoResolution()
    if (resolution) {
      setResolution(resolution)
    }
const maxResMode = getMaxResolutionMode()
    setMaxResolutionMode(maxResMode)

    
    requestMediaPermissions(resolution)

    // Initialize AutoClicker based on saved setting
    const autoClickerMode = getAutoClickerMode()
    console.log('[App] Initializing AutoClicker with mode:', autoClickerMode)
    if (autoClickerMode === 'enable') {
      startAutoClicker()
    }

    return (): void => {
      camera.close()
      window.electron.ipcRenderer.invoke(IpcEvents.CLOSE_SERIAL_PORT)
      stopAutoClicker()
    }
  }, [])

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
          <Mouse />
          {isKeyboardEnable && <Keyboard />}
        </>
      )}

      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          overflow: 'auto',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 0
        }}
      >
        <video
          id="video"
          width={videoDimensions.width * devicePixelRatio}
          height={videoDimensions.height * devicePixelRatio}
          className={clsx(
            'block select-none',
            videoState === 'connected' ? 'opacity-100' : 'opacity-0',
            mouseMode === 'relative' ? 'cursor-none' : mouseStyle
          )}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain'
          }}
          autoPlay
          playsInline
        />
      </div>

      <VirtualKeyboard isBigScreen={isBigScreen} />
    </>
  )
}

export default App
