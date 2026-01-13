import { ReactElement, useEffect, useState } from 'react'
import { Divider, Popover, Select } from 'antd'
import clsx from 'clsx'
import { useAtom } from 'jotai'
import { CpuIcon, LoaderCircleIcon, RadioIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IpcEvents } from '@common/ipc-events'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { baudRateAtom, serialPortAtom } from '@renderer/jotai/device'
import * as storage from '@renderer/libs/storage'

const baudRateOptions = [
  { value: 1200, label: '1200' },
  { value: 2400, label: '2400' },
  { value: 4800, label: '4800' },
  { value: 9600, label: '9600' },
  { value: 14400, label: '14400' },
  { value: 19200, label: '19200' },
  { value: 38400, label: '38400' },
  { value: 57600, label: '57600' },
  { value: 115200, label: '115200' }
]

export const SerialPort = (): ReactElement => {
  const { t } = useTranslation()
  const [serialPort, setSerialPort] = useAtom(serialPortAtom)
  const [baudRate, setBaudRate] = useAtom(baudRateAtom)

  const [connectingPort, setConnectingPort] = useState('')
  const [serialPorts, setSerialPorts] = useState<string[]>([])
  const [isBaudRateLoading, setIsBaudRateLoading] = useState(false)

  useEffect(() => {
    const savedBaudRate = storage.getBaudRate()
    setBaudRate(savedBaudRate)

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

  async function openSerialPort(port: string, customBaudRate?: number): Promise<void> {
    if (connectingPort) return
    setConnectingPort(port)

    const rate = customBaudRate ?? baudRate
    const success = await window.electron.ipcRenderer.invoke(IpcEvents.OPEN_SERIAL_PORT, port, rate)
    if (success) {
      setSerialPort(port)
      storage.setSerialPort(port)
    }
  }

  async function closeSerialPort(): Promise<void> {
    await window.electron.ipcRenderer.invoke(IpcEvents.CLOSE_SERIAL_PORT)
    setSerialPort('')
    storage.setSerialPort('')
  }

  async function handleBaudRateChange(newBaudRate: number): Promise<void> {
    setBaudRate(newBaudRate)
    storage.setBaudRate(newBaudRate)

    if (serialPort) {
      setIsBaudRateLoading(true)

      await closeSerialPort()
      await new Promise((r) => setTimeout(r, 500))
      openSerialPort(serialPort, newBaudRate)

      setIsBaudRateLoading(false)
    }
  }

  const content = (
    <div className="min-w-[200px] pt-2 pb-3">
      <div className="mb-1 px-3 text-sm text-neutral-500">{t('menu.serialPort.device')}</div>
      <ScrollArea className="[&>[data-radix-scroll-area-viewport]]:max-h-[250px]">
        {serialPorts.length === 0 ? (
          <div className="p-3 text-sm text-neutral-500">{t('menu.serialPort.noDeviceFound')}</div>
        ) : (
          serialPorts.map((port: string) => (
            <div
              key={port}
              className={clsx(
                'flex w-[230px] cursor-pointer items-center space-x-2 rounded px-3 py-2 hover:bg-neutral-700/50',
                port === serialPort ? 'text-blue-500' : 'text-white'
              )}
              onClick={() => openSerialPort(port)}
            >
              {port === connectingPort ? (
                <LoaderCircleIcon className="animate-spin" size={16} />
              ) : (
                <RadioIcon size={16} />
              )}
              <span className="truncate" title={port}>
                {port}
              </span>
            </div>
          ))
        )}
      </ScrollArea>

      {serialPorts.length > 0 && (
        <div className="px-3">
          <Divider style={{ margin: '20px 0', opacity: '0.5' }} />

          <div className="mb-3 text-sm text-neutral-500">{t('menu.serialPort.baudRate')}</div>
          <Select
            value={baudRate}
            style={{ width: '100%' }}
            loading={isBaudRateLoading}
            options={baudRateOptions}
            onChange={handleBaudRateChange}
          />
        </div>
      )}
    </div>
  )

  return (
    <Popover content={content} placement="bottomLeft" trigger="click" arrow={false}>
      <div
        className={clsx(
          'flex h-[28px] cursor-pointer items-center justify-center rounded px-2 text-white hover:bg-neutral-700/70'
        )}
        title={serialPort ? `${serialPort} @ ${baudRate}` : t('menu.serialPort.clickToSelect')}
      >
        <CpuIcon size={18} />
      </div>
    </Popover>
  )
}
