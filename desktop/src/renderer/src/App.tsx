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
import { mouseStyleAtom } from '@renderer/jotai/mouse'
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
  const mouseStyle = useAtomValue(mouseStyleAtom)
  const isKeyboardEnable = useAtomValue(isKeyboardEnableAtom)
  const setResolution = useSetAtom(resolutionAtom)

  const [state, setState] = useState<State>('loading')

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
      <DeviceModal />

      {videoState === 'connected' && serialPortState === 'connected' && (
        <>
          <Menu />
          <Mouse />
          {isKeyboardEnable && <Keyboard />}
        </>
      )}

      <video
        id="video"
        className={clsx('block min-h-[480px] min-w-[640px] select-none', mouseStyle)}
        style={{
          transform: `scale(${videoScale})`,
          transformOrigin: 'center',
          maxWidth: '100%',
          maxHeight: '100%',
          objectFit: 'scale-down'
        }}
        autoPlay
        playsInline
      />

      <VirtualKeyboard isBigScreen={isBigScreen} />
    </>
  )
}

export default App
