import { ReactElement, useState } from 'react'
import { Popover } from 'antd'
import clsx from 'clsx'
import { useAtom, useAtomValue } from 'jotai'
import { VideoIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IpcEvents } from '@common/ipc-events'
import { captureDeviceAtom, captureModeAtom } from '@renderer/jotai/device'
import * as storage from '@renderer/libs/storage'

type CaptureDeviceInfo = {
  index: number
  name: string
}

// Capture-device picker for the uncompressed mode. AVFoundation devices are
// selected by NAME (indices shift when Continuity cameras come and go).
export const CaptureDevice = (): ReactElement | null => {
  const { t } = useTranslation()
  const captureMode = useAtomValue(captureModeAtom)
  const [captureDevice, setCaptureDevice] = useAtom(captureDeviceAtom)
  const [devices, setDevices] = useState<CaptureDeviceInfo[]>([])

  if (!captureMode) return null

  async function getDevices(): Promise<void> {
    const list = await window.electron.ipcRenderer.invoke(IpcEvents.GET_CAPTURE_DEVICES)
    setDevices(list)
  }

  function selectDevice(name: string): void {
    setCaptureDevice(name)
    storage.setCaptureDevice(name)
  }

  const content = (
    <>
      {devices.map((device) => (
        <div
          key={device.name}
          className={clsx(
            'flex cursor-pointer items-center space-x-1.5 rounded px-3 py-1.5 select-none hover:bg-neutral-700/60',
            captureDevice === device.name ? 'text-blue-500' : 'text-white'
          )}
          onClick={() => selectDevice(device.name)}
        >
          <span>{device.name}</span>
        </div>
      ))}
    </>
  )

  return (
    <Popover content={content} placement="rightTop" arrow={false} align={{ offset: [13, 0] }}>
      <div
        className="flex h-[30px] cursor-pointer items-center space-x-2 rounded px-3 text-neutral-300 hover:bg-neutral-700/50"
        onMouseEnter={getDevices}
      >
        <VideoIcon size={16} />
        <span className="text-sm select-none">{t('video.captureDevice')}</span>
      </div>
    </Popover>
  )
}
