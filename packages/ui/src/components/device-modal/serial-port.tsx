import { useEffect, useState } from 'react'
import { Button, Select } from 'antd'
import { useAtom, useAtomValue } from 'jotai'
import { useTranslation } from 'react-i18next'

import type { SerialPortInfo } from '@nanokvm/core'
import { autoReconnectAtom, baudRateAtom, serialPortAtom, serialStateAtom } from '@/jotai/device.ts'
import * as storage from '@/libs/storage'
import { getPlatform } from '@/services'

const BAUD_RATE_OPTIONS = [
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

type SerialPortProps = {
  setErrMsg: (msg: string) => void
}

export const SerialPort = ({ setErrMsg }: SerialPortProps) => {
  const { t } = useTranslation()

  const transport = getPlatform().transport
  const supportsEnumeration = transport.supportsEnumeration()

  const [serialState, setSerialState] = useAtom(serialStateAtom)
  const [serialPort, setSerialPort] = useAtom(serialPortAtom)
  const [baudRate, setBaudRate] = useAtom(baudRateAtom)
  const autoReconnect = useAtomValue(autoReconnectAtom)

  const [ports, setPorts] = useState<SerialPortInfo[]>([])
  const [isReconnecting, setIsReconnecting] = useState(false)

  useEffect(() => {
    if (serialState === 'connected') return

    if (!transport.isSupported()) {
      setSerialState('notSupported')
      return
    }

    if (!supportsEnumeration) return

    let cancelled = false

    listPorts().then((available) => {
      if (cancelled || !autoReconnect) return

      const savedPort = storage.getSerialPort()
      if (!savedPort || !available.some((port) => port.path === savedPort)) return

      setIsReconnecting(true)
      openPort(savedPort, storage.getBaudRate()).finally(() => setIsReconnecting(false))
    })

    return () => {
      cancelled = true
    }
  }, [])

  async function listPorts(): Promise<SerialPortInfo[]> {
    const available = await transport.list()
    setPorts(available)
    return available
  }

  async function openPort(path: string, rate: number = baudRate): Promise<void> {
    if (serialState === 'connecting') return

    setSerialState('connecting')
    setErrMsg('')

    try {
      await transport.open({ path, baudRate: rate })
      setSerialPort(path)
      storage.setSerialPort(path)
      setSerialState('connected')
    } catch (err) {
      console.log(err)
      setSerialState('disconnected')
      setErrMsg(t('serial.failed'))
    }
  }

  async function selectSerialPort(): Promise<void> {
    if (serialState === 'connecting') return

    setSerialState('connecting')
    setErrMsg('')

    try {
      await transport.request()
      await transport.open({ baudRate })
      setSerialState('connected')
    } catch (err) {
      console.log(err)
      setSerialState('disconnected')
      setErrMsg(t('serial.failed'))
    }
  }

  async function changeBaudRate(rate: number): Promise<void> {
    setBaudRate(rate)
    storage.setBaudRate(rate)

    // 桌面端在已连接时切换波特率：重开端口让新速率立即生效
    if (serialState === 'connected' && supportsEnumeration && serialPort) {
      try {
        await transport.close()
        await new Promise((resolve) => setTimeout(resolve, 300))
        await transport.open({ path: serialPort, baudRate: rate })
      } catch (err) {
        console.log(err)
        setSerialState('disconnected')
      }
    }
  }

  if (serialState === 'notSupported') {
    return null
  }

  const baudRateSelect = (
    <Select
      value={baudRate}
      style={{ width: supportsEnumeration ? 140 : 250 }}
      options={BAUD_RATE_OPTIONS}
      onChange={changeBaudRate}
      title={t('modal.baudRate')}
    />
  )

  if (!supportsEnumeration) {
    return (
      <div className="flex w-[280px] items-center justify-center space-x-2">
        <Button
          type={serialState === 'connected' ? 'primary' : 'default'}
          className="flex-1"
          loading={serialState === 'connecting'}
          onClick={selectSerialPort}
        >
          {t('modal.selectSerial')}
        </Button>
        {baudRateSelect}
      </div>
    )
  }

  return (
    <div className="flex w-[280px] items-center justify-center space-x-2">
      <Select
        value={serialPort || undefined}
        style={{ width: 250 }}
        options={ports.map((port) => ({ value: port.path, label: port.label }))}
        allowClear={true}
        loading={serialState === 'connecting' || isReconnecting}
        placeholder={t('modal.selectSerial')}
        onChange={(path) => (path ? openPort(path) : undefined)}
        onClick={() => listPorts()}
      />
      {baudRateSelect}
    </div>
  )
}
