import { ReactElement, useState } from 'react'
import { Modal } from 'antd'
import { useTranslation } from 'react-i18next'

import { SerialPort } from './serial-port'
import { Video } from './video'

export const DeviceModal = (): ReactElement => {
  const { t } = useTranslation()

  const [errMsg, setErrMsg] = useState('')

  return (
    <Modal open={true} title={t('modal.title')} footer={null} closable={false} destroyOnClose>
      <div className="flex flex-col items-center justify-center space-y-5 py-10">
        <Video setErrMsg={setErrMsg} />

        <SerialPort setErrMsg={setErrMsg} />

        {errMsg && <span className="text-xs text-red-500">{errMsg}</span>}
      </div>
    </Modal>
  )
}
