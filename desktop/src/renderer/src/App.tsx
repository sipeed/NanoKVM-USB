import { ReactElement, useEffect, useState } from 'react'
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
  videoStateAtom
} from '@renderer/jotai/device'
import { isKeyboardEnableAtom } from '@renderer/jotai/keyboard'
import { mouseModeAtom, mouseStyleAtom } from '@renderer/jotai/mouse'
import { startAutoClicker, stopAutoClicker } from '@renderer/libs/auto-clicker'
import { camera } from '@renderer/libs/media/camera'
import { requestCameraPermission } from '@renderer/libs/media/permission'
import { getAutoClickerMode, getVideoResolution } from '@renderer/libs/storage'
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

  useEffect(() => {
    const resolution = getVideoResolution()
    if (resolution) {
      setResolution(resolution)
    }

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

      <video
        id="video"
        className={clsx(
          'block origin-center select-none',
          videoScale === 0
            ? 'h-full w-full object-contain'
            : 'max-h-full min-h-[480px] max-w-full min-w-[640px] object-scale-down',
          videoState === 'connected' ? 'opacity-100' : 'opacity-0',
          mouseMode === 'relative' ? 'cursor-none' : mouseStyle
        )}
        style={videoScale === 0 ? undefined : { transform: `scale(${videoScale})` }}
        autoPlay
        playsInline
      />

      <VirtualKeyboard isBigScreen={isBigScreen} />
    </>
  )
}

export default App
