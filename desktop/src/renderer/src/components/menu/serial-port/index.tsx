import { ReactElement, useEffect, useState } from 'react'
import { Popover } from 'antd'
import clsx from 'clsx'
import { useAtom } from 'jotai'
import { CpuIcon, LoaderCircleIcon, RadioIcon } from 'lucide-react'

import { IpcEvents } from '@common/ipc-events'
import { serialPortAtom, serialPortBaudRateAtom } from '@renderer/jotai/device'

export const SerialPort = (): ReactElement => {
  const [serialPort, setSerialPort] = useAtom(serialPortAtom)
  const [serialBaudRate, setSerialBaudRate] = useAtom(serialBaudRateAtom)

  const [connectingPort, setConnectingPort] = useState('')
  const [serialPorts, setSerialPorts] = useState<string[]>([])

  useEffect(() => {
    getSerialPorts()

    const rmListener = window.electron.ipcRenderer.on(IpcEvents.OPEN_SERIAL_PORT_RSP, () => {
      setConnectingPort('')
    })

    return (): void => {
      rmListener()
    }
  }, [])

  async function getSerialPorts(): Promise<void> {
    const ports = await window.electron.ipcRenderer.invoke(IpcEvents.GET_SERIAL_PORTS)
    setSerialPorts(ports)
  }

  async function openSerialPort(port: string, baudRate: string): Promise<void> {
    if (connectingPort) return
    setConnectingPort(port)

    const success = await window.electron.ipcRenderer.invoke(IpcEvents.OPEN_SERIAL_PORT, port, baudRate)
    if (success) {
      setSerialPort(port)
      setSerialBaudRate(baudRate)
    }
  }

  const content = (
    <div className="max-h-[350px] overflow-y-auto">
      {serialPorts.map((port: string) => (
        <div
          key={port}
          className={clsx(
            'flex cursor-pointer items-center space-x-2 rounded px-3 py-2 hover:bg-neutral-700/60',
            port === serialPort ? 'text-blue-500' : 'text-white'
          )}
          onClick={() => {
              var baudRate = window.prompt("Baudrate: 9600 for CH340, 57600 for CH341 (NanoKVM)", "57600");
              openSerialPort(port, baudRate);
            }
          }
        >
          {port === connectingPort ? (
            <LoaderCircleIcon className="animate-spin" size={16} />
          ) : (
            <RadioIcon size={16} />
          )}
          <span>{port}</span>
        </div>
      ))}
    </div>
  )

  return (
    <Popover content={content} placement="bottomLeft" trigger="click" arrow={false}>
      <div className="flex h-[28px] cursor-pointer items-center justify-center rounded px-2 text-white hover:bg-neutral-700/70">
        <CpuIcon size={18} />
      </div>
    </Popover>
  )
}
