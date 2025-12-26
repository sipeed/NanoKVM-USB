import { ReactElement, useEffect, useState } from 'react'
import { Modal } from 'antd'
import { useAtomValue } from 'jotai'
import { useTranslation } from 'react-i18next'

import { serialPortStateAtom, videoStateAtom } from '@renderer/jotai/device'

import { SerialPort } from './serial-port'
import { Video } from './video'

export const DeviceModal = (): ReactElement => {
  const { t } = useTranslation()

  const videoState = useAtomValue(videoStateAtom)
  const serialPortState = useAtomValue(serialPortStateAtom)

  const [isOpen, setIsOpen] = useState(false)
  const [errMsg, setErrMsg] = useState('')

  useEffect(() => {
    if (videoState === 'connected' && serialPortState === 'connected') {
      setIsOpen(false)
      return
    }

    setIsOpen(true)
  }, [videoState, serialPortState])

  return (
    <Modal open={isOpen} title={t('modal.title')} footer={null} closable={false} destroyOnClose>
      <div className="flex flex-col items-center justify-center space-y-5 py-10">
        <Video setErrMsg={setErrMsg} />
        <SerialPort setErrMsg={setErrMsg} />

        {errMsg && <span className="text-xs text-red-500">{errMsg}</span>}
      </div>
    </Modal>
  )
}
