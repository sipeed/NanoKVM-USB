import { ReactElement, useEffect, useState } from 'react'
import { Select, Space } from 'antd'
import { useAtom } from 'jotai'
import { useTranslation } from 'react-i18next'

import { IpcEvents } from '@common/ipc-events'
import { serialPortAtom, serialPortStateAtom, baudRateAtom } from '@renderer/jotai/device'
import * as storage from '@renderer/libs/storage'

type Option = {
  value: string
  label: string
}

type SerialPortProps = {
  setMsg: (msg: string) => void
}

export const SerialPort = ({ setMsg }: SerialPortProps): ReactElement => {
  const { t } = useTranslation()

  const [serialPort, setSerialPort] = useAtom(serialPortAtom)
  const [serialPortState, setSerialPortState] = useAtom(serialPortStateAtom)
  const [baudRate, setBaudRate] = useAtom(baudRateAtom)

  const [options, setOptions] = useState<Option[]>([])
  const [isFailed, setIsFailed] = useState(false)

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

  useEffect(() => {
    const savedBaudRate = storage.getBaudRate()
    setBaudRate(savedBaudRate)

    getSerialPorts(true)

    const rmListener = window.electron.ipcRenderer.on(IpcEvents.OPEN_SERIAL_PORT_RSP, (_, err) => {
      if (err === '') {
        setSerialPortState('connected')
      } else {
        setIsFailed(true)
        setSerialPort('')
        setSerialPortState('disconnected')
        storage.setSerialPort('')
        setMsg(err)
      }
    })

    return (): void => {
      rmListener()
    }
  }, [])

  async function getSerialPorts(autoOpen: boolean): Promise<void> {
    const serialPorts = await window.electron.ipcRenderer.invoke(IpcEvents.GET_SERIAL_PORTS)
    setOptions(serialPorts.map((sp: string) => ({ value: sp, label: sp })))

    if (autoOpen) {
      const port = storage.getSerialPort()
      if (port && serialPorts.includes(port)) {
        const savedBaudRate = storage.getBaudRate()
        await selectSerialPort(port, savedBaudRate)
      }
    }
  }

  async function selectSerialPort(port: string, customBaudRate?: number): Promise<void> {
    if (serialPortState === 'connecting') return
    setSerialPortState('connecting')
    setIsFailed(false)
    setMsg('')

    const rate = customBaudRate ?? baudRate
    const success = await window.electron.ipcRenderer.invoke(IpcEvents.OPEN_SERIAL_PORT, port, rate)

    if (success) {
      setSerialPort(port)
      storage.setSerialPort(port)
    } else {
      setSerialPortState('disconnected')
    }
  }

  async function closeSerialPort(): Promise<void> {
    await window.electron.ipcRenderer.invoke(IpcEvents.CLOSE_SERIAL_PORT)
    setSerialPort('')
    setSerialPortState('disconnected')
    storage.setSerialPort('')
  }

  async function handleBaudRateChange(newBaudRate: number): Promise<void> {
    setBaudRate(newBaudRate)
    storage.setBaudRate(newBaudRate)

    if (serialPort && serialPortState === 'connected') {
      const currentPort = serialPort
      await closeSerialPort()
      setTimeout(() => {
        selectSerialPort(currentPort, newBaudRate)
      }, 200)
    }
  }

  return (
    <Space direction="vertical" size="small" style={{ width: '100%', alignItems: 'center' }}>
      <Select
        value={serialPort || undefined}
        style={{ width: 280 }}
        options={options}
        loading={serialPortState === 'connecting'}
        status={isFailed ? 'error' : undefined}
        placeholder={t('modal.selectSerial')}
        onChange={(serialPort) => selectSerialPort(serialPort)}
        onClick={() => getSerialPorts(false)}
      />
      <Select
        value={baudRate}
        style={{ width: 280 }}
        options={baudRateOptions}
        placeholder={t('modal.selectBaudRate')}
        onChange={handleBaudRateChange}
      />
    </Space>
  )
}
