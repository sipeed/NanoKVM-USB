import { useEffect, useState } from 'react'
import { Modal, Switch } from 'antd'
import { useAtom, useAtomValue } from 'jotai'
import { useTranslation } from 'react-i18next'

import {
  autoReconnectAtom,
  deviceModalOpenAtom,
  serialStateAtom,
  videoStateAtom
} from '@/jotai/device.ts'
import * as storage from '@/libs/storage'
import { getPlatform } from '@/services'

import { SerialPort } from './serial-port'
import { Video } from './video'

export const DeviceModal = () => {
  const { t } = useTranslation()

  const videoState = useAtomValue(videoStateAtom)
  const serialState = useAtomValue(serialStateAtom)
  const [autoReconnect, setAutoReconnect] = useAtom(autoReconnectAtom)
  const [isOpen, setIsOpen] = useAtom(deviceModalOpenAtom)

  const [errMsg, setErrMsg] = useState('')

  const transport = getPlatform().transport
  const supportsEnumeration = transport.supportsEnumeration()

  const isReady =
    videoState === 'connected' && (serialState === 'connected' || serialState === 'notSupported')

  useEffect(() => {
    if (isReady) {
      setIsOpen(false)
    }
  }, [isReady, setIsOpen])

  return (
    <Modal
      open={isOpen || !isReady}
      title={t('modal.title')}
      footer={null}
      closable={isReady}
      maskClosable={isReady}
      keyboard={isReady}
      destroyOnHidden
      onCancel={() => setIsOpen(false)}
      afterClose={() => setErrMsg('')}
    >
      <div className="flex flex-col items-center justify-center space-y-5 py-10">
        <Video setErrMsg={setErrMsg} />
        <SerialPort setErrMsg={setErrMsg} />

        {supportsEnumeration && (
          <div className="flex w-[280px] items-center justify-between">
            <span className="text-sm text-neutral-400">{t('modal.autoReconnect')}</span>
            <Switch
              value={autoReconnect}
              onChange={(enabled) => {
                setAutoReconnect(enabled)
                storage.setAutoReconnect(enabled)
              }}
            />
          </div>
        )}

        {errMsg && <span className="text-xs text-red-500">{errMsg}</span>}
      </div>
    </Modal>
  )
}
