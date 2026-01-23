import { ReactElement, useEffect, useState } from 'react'
import { Result, Spin } from 'antd'
import clsx from 'clsx'
import { useAtomValue, useSetAtom } from 'jotai'
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
  videoScaleAtom,
  videoStateAtom
} from '@renderer/jotai/device'
import { isKeyboardEnableAtom } from '@renderer/jotai/keyboard'
import { mouseModeAtom, mouseStyleAtom } from '@renderer/jotai/mouse'
import { camera } from '@renderer/libs/camera'
import { getVideoResolution } from '@renderer/libs/storage'
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
  const setResolution = useSetAtom(resolutionAtom)

  const [state, setState] = useState<State>('loading')
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    const resolution = getVideoResolution()
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
      const platform = await window.electron.ipcRenderer.invoke(IpcEvents.GET_PLATFORM)
      if (platform === 'darwin') {
        const res = await window.electron.ipcRenderer.invoke(IpcEvents.REQUEST_MEDIA_PERMISSIONS)

        if (!res.camera) {
          setState('failed')
          return
        }
      } else {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: resolution?.width || 1920 },
            height: { ideal: resolution?.height || 1080 },
            frameRate: { ideal: 60 }
          },
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            sampleRate: 48000
          }
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
        className={clsx(
          'block max-h-full min-h-[480px] max-w-full min-w-[640px] origin-center object-scale-down select-none',
          videoState === 'connected' ? 'opacity-100' : 'opacity-0',
          mouseMode === 'relative' ? 'cursor-none' : mouseStyle
        )}
        style={{ transform: `scale(${videoScale})` }}
        autoPlay
        playsInline
      />

      <VirtualKeyboard isBigScreen={isBigScreen} />
    </>
  )
}

export default App
