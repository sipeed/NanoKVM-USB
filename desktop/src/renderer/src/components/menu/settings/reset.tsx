import { ReactElement, useState } from 'react'
import { Button, Modal } from 'antd'
import { useTranslation } from 'react-i18next'

import * as storage from '@renderer/libs/storage'

export const Reset = (): ReactElement => {
  const { t } = useTranslation()
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false)

  function handleReset(): void {
    setIsConfirmModalOpen(true)
  }

  function confirmReset(): void {
    storage.clearAllSettings()
    setIsConfirmModalOpen(false)
    window.location.reload()
  }

  function cancelReset(): void {
    setIsConfirmModalOpen(false)
  }

  return (
    <>
      <div className="space-y-6">
        <div>
          <div className="text-xl font-bold">{t('settings.reset.title')}</div>
          <div className="pt-2 text-sm text-neutral-400">{t('settings.reset.description')}</div>
        </div>

        <div className="w-full rounded-lg border border-red-600/30 bg-red-600/10 p-4">
          <div className="text-sm font-medium text-red-400">{t('settings.reset.warning')}</div>
          <div className="mt-2 text-xs text-red-300">{t('settings.reset.warningDescription')}</div>
        </div>

        <div className="flex w-full justify-center">
          <Button type="primary" danger onClick={handleReset} className="w-52">
            {t('settings.reset.button')}
          </Button>
        </div>
      </div>

      <Modal
        title={t('settings.reset.confirmTitle')}
        open={isConfirmModalOpen}
        onOk={confirmReset}
        onCancel={cancelReset}
        okText={t('settings.reset.confirm')}
        cancelText={t('settings.reset.cancel')}
        okButtonProps={{ danger: true }}
      >
        <p>{t('settings.reset.confirmMessage')}</p>
      </Modal>
    </>
  )
}
