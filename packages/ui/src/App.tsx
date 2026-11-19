import { CSSProperties, useEffect, useMemo, useState } from 'react'
import { Alert, Result, Spin } from 'antd'
import clsx from 'clsx'
import { useAtomValue, useSetAtom } from 'jotai'
import { useTranslation } from 'react-i18next'
import { useMediaQuery } from 'react-responsive'

import { DeviceModal } from '@/components/device-modal'
import { Keyboard } from '@/components/keyboard'
import { Menu } from '@/components/menu'
import { Mouse } from '@/components/mouse'
import { VirtualKeyboard } from '@/components/virtual-keyboard'
import {
  resolutionAtom,
  serialPortAtom,
  serialStateAtom,
  videoDeviceIdAtom,
  videoRotationAtom,
  videoScaleAtom,
  videoStateAtom
} from '@/jotai/device.ts'
import { isKeyboardEnableAtom } from '@/jotai/keyboard.ts'
import { mouseModeAtom, mouseStyleAtom } from '@/jotai/mouse.ts'
import { camera } from '@/libs/media/camera'
import { checkPermission, requestCameraPermission } from '@/libs/media/permission.ts'
import * as storage from '@/libs/storage'
import { getPlatform } from '@/services'
import type { Resolution } from '@/types.ts'

type State = 'loading' | 'success' | 'failed'

export const App = () => {
  const { t } = useTranslation()
  const isBigScreen = useMediaQuery({ minWidth: 850 })

  const mouseStyle = useAtomValue(mouseStyleAtom)
  const mouseMode = useAtomValue(mouseModeAtom)
  const videoScale = useAtomValue(videoScaleAtom)
  const videoState = useAtomValue(videoStateAtom)
  const videoRotation = useAtomValue(videoRotationAtom)
  const serialState = useAtomValue(serialStateAtom)
  const isKeyboardEnable = useAtomValue(isKeyboardEnableAtom)

  const setResolution = useSetAtom(resolutionAtom)
  const setVideoState = useSetAtom(videoStateAtom)
  const setVideoDeviceId = useSetAtom(videoDeviceIdAtom)
  const setSerialState = useSetAtom(serialStateAtom)
  const setSerialPort = useSetAtom(serialPortAtom)

  const [state, setState] = useState<State>('loading')

  const shouldSwapDimensions = videoRotation === 90 || videoRotation === 270

  useEffect(() => {
    const resolution = storage.getVideoResolution()
    if (resolution) {
      setResolution(resolution)
    }

    const unsubscribe = getPlatform().transport.onDisconnect(() => {
      setVideoState('disconnected')
      setVideoDeviceId('')
      setSerialState('disconnected')
      setSerialPort('')
      camera.close()
    })

    requestMediaPermissions(resolution)

    return () => {
      unsubscribe()
      camera.close()
      getPlatform()
        .transport.close()
        .catch(() => {})
    }
  }, [])

  const videoStyle = useMemo(() => {
    const baseStyle: CSSProperties = {
      transformOrigin: 'center',
      maxWidth: shouldSwapDimensions ? '100vh' : '100%',
      maxHeight: shouldSwapDimensions ? '100vw' : '100%'
    }

    if (videoScale === 0) {
      return {
        ...baseStyle,
        width: shouldSwapDimensions ? '100vh' : '100%',
        height: shouldSwapDimensions ? '100vw' : '100%',
        objectFit: 'contain' as const,
        transform: `rotate(${videoRotation}deg)`
      }
    }

    return {
      ...baseStyle,
      objectFit: 'scale-down' as const,
      transform: `scale(${videoScale}) rotate(${videoRotation}deg)`
    }
  }, [videoScale, videoRotation, shouldSwapDimensions])

  async function requestMediaPermissions(resolution?: Resolution): Promise<void> {
    try {
      const isGranted = await checkPermission('camera')
      if (isGranted) {
        setState('success')
        return
      }

      const isSuccess = await requestCameraPermission(resolution)
      setState(isSuccess ? 'success' : 'failed')
    } catch (err) {
      if (err instanceof Error && ['NotAllowedError', 'PermissionDeniedError'].includes(err.name)) {
        setState('failed')
      } else {
        setState('success')
      }
    }
  }

  if (state === 'loading') {
    return <Spin size="large" spinning={true} description={t('camera.tip')} fullscreen />
  }

  if (state === 'failed') {
    return (
      <Result
        status="info"
        title={t('camera.denied')}
        extra={[<h2 className="text-xl text-white">{t('camera.authorize')}</h2>]}
      />
    )
  }

  return (
    <>
      <DeviceModal />

      {videoState === 'connected' && (
        <>
          <Menu />

          {serialState === 'notSupported' && (
            <Alert title={t('serial.notSupported')} type="warning" banner closable />
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
        className={clsx(
          'block select-none',
          shouldSwapDimensions ? 'min-h-[640px] min-w-[360px]' : 'min-h-[360px] min-w-[640px]',
          mouseMode === 'relative' ? 'cursor-none' : mouseStyle,
          videoState === 'connected' ? 'opacity-100' : 'opacity-0'
        )}
        style={videoStyle}
        autoPlay
        playsInline
      />

      <VirtualKeyboard isBigScreen={isBigScreen} />
    </>
  )
}
