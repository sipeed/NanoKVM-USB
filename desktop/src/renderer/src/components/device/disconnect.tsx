import { ReactElement, useEffect } from 'react'
import { useSetAtom } from 'jotai'

import { IpcEvents } from '@common/ipc-events'
import {
  serialPortAtom,
  serialPortStateAtom,
  videoDeviceIdAtom,
  videoStateAtom
} from '@renderer/jotai/device'

export const Disconnect = (): ReactElement => {
  const setVideoState = useSetAtom(videoStateAtom)
  const setVideoDeviceId = useSetAtom(videoDeviceIdAtom)
  const setSerialPortState = useSetAtom(serialPortStateAtom)
  const setSerialPort = useSetAtom(serialPortAtom)

  useEffect(() => {
    const rmListener = window.electron.ipcRenderer.on(IpcEvents.SERIAL_PORT_DISCONNECTED, () => {
      setVideoState('disconnected')
      setSerialPortState('disconnected')

      setVideoDeviceId('')
      setSerialPort('')
    })

    return () => {
      rmListener()
    }
  }, [setSerialPort, setSerialPortState, setVideoDeviceId, setVideoState])

  return <></>
}
