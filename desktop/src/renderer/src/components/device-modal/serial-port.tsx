import { ReactElement, useEffect, useState } from 'react'
import { Select } from 'antd'
import { useAtom } from 'jotai'
import { useTranslation } from 'react-i18next'

import { IpcEvents } from '@common/ipc-events'
import { baudRateAtom, serialPortAtom, serialPortStateAtom } from '@renderer/jotai/device'
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

  useEffect(() => {
    const savedBaudRate = storage.getBaudRate()
    setBaudRate(savedBaudRate)

    getSerialPorts(true)

    const rmOpenListener = window.electron.ipcRenderer.on(IpcEvents.OPEN_SERIAL_PORT_RSP, (_, err) => {
      if (err === '') {
        console.log('[SerialPort] ✓ Connected successfully')
        setSerialPortState('connected')
      } else {
        console.error('[SerialPort] ✗ Connection error:', err)
        setIsFailed(true)
        setSerialPort('')
        setSerialPortState('disconnected')
        storage.setSerialPort('')
        setMsg(err)
      }
    })

    // Handle system resume from sleep
    const rmResumeListener = window.electron.ipcRenderer.on(IpcEvents.SYSTEM_RESUME, async () => {
      console.log('System resumed, attempting to reconnect serial port')
      const port = storage.getSerialPort()
      if (port && serialPortState === 'connected') {
        // Wait a bit for USB devices to be ready
        await new Promise(resolve => setTimeout(resolve, 1000))
        await selectSerialPort(port)
      }
    })

    return (): void => {
      rmOpenListener()
      rmResumeListener()
    }
  }, [])

  async function getSerialPorts(autoOpen: boolean): Promise<void> {
    console.log('[SerialPort] Getting serial ports list...')
    const serialPorts = await window.electron.ipcRenderer.invoke(IpcEvents.GET_SERIAL_PORTS)
    console.log('[SerialPort] Available ports:', serialPorts)
    setOptions(serialPorts.map((sp: string) => ({ value: sp, label: sp })))

    if (autoOpen) {
      const port = storage.getSerialPort()
      console.log('[SerialPort] Auto-open enabled, saved port:', port)
      if (port && serialPorts.includes(port)) {
        const savedBaudRate = storage.getBaudRate()
        console.log('[SerialPort] Attempting to auto-connect to:', port, 'at', savedBaudRate, 'baud')
        await selectSerialPort(port, savedBaudRate)
      } else if (port) {
        console.warn('[SerialPort] Saved port not found in available ports')
      } else {
        console.log('[SerialPort] No saved port found')
      }
    }
  }

  async function selectSerialPort(port: string, customBaudRate?: number): Promise<void> {
    if (serialPortState === 'connecting') return
    console.log('[SerialPort] Connecting to:', port)
    setSerialPortState('connecting')
    setIsFailed(false)
    setMsg('')

    const rate = customBaudRate ?? baudRate
    const success = await window.electron.ipcRenderer.invoke(IpcEvents.OPEN_SERIAL_PORT, port, rate)

    if (success) {
      console.log('[SerialPort] ✓ Connection initiated, waiting for response...')
      setSerialPort(port)
      storage.setSerialPort(port)
    } else {
      console.error('[SerialPort] ✗ Connection failed')
      setSerialPortState('disconnected')
    }
  }

  return (
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
  )
}
