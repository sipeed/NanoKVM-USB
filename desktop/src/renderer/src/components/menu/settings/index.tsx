import { ReactElement, useEffect, useState } from 'react'
import { Badge, Modal } from 'antd'
import clsx from 'clsx'
import { BadgeInfoIcon, CircleArrowUpIcon, PaletteIcon, SettingsIcon, RotateCcwIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IpcEvents } from '@common/ipc-events'
import * as storage from '@renderer/libs/storage'

import { About } from './about'
import { Appearance } from './appearance'
import { Update } from './update'
import { Reset } from './reset'

export const Settings = (): ReactElement => {
  const { t } = useTranslation()

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [currentTab, setCurrentTab] = useState('appearance')
  const [isUpdateAvailable, setIsUpdateAvailable] = useState(false)

  useEffect(() => {
    const skip = storage.getSkipUpdate()
    if (skip) return

    window.electron.ipcRenderer.invoke(IpcEvents.CHECK_FOR_UPDATES).then((info) => {
      if (info?.version) {
        setIsUpdateAvailable(true)
      }
    })
  }, [])

  const tabs = [
    { id: 'appearance', icon: <PaletteIcon size={16} />, component: <Appearance /> },
    { id: 'update', icon: <CircleArrowUpIcon size={16} />, component: <Update /> },
    { id: 'reset', icon: <RotateCcwIcon size={16} />, component: <Reset /> },
    { id: 'about', icon: <BadgeInfoIcon size={16} />, component: <About /> }
  ]

  function changeTab(tab: string): void {
    setCurrentTab(tab)

    if (isUpdateAvailable && tab === 'update') {
      setIsUpdateAvailable(false)
      storage.setSkipUpdate(true)
    }
  }

  function closeModal(): void {
    setIsModalOpen(false)
    setCurrentTab('appearance')
  }

  return (
    <>
      <div
        className="flex h-[28px] cursor-pointer items-center justify-center rounded px-2 text-white hover:bg-neutral-700/70"
        onClick={() => setIsModalOpen(true)}
      >
        <SettingsIcon size={18} />
      </div>

      <Modal
        open={isModalOpen}
        width={820}
        footer={null}
        destroyOnClose={true}
        styles={{ content: { padding: 0 } }}
        onCancel={closeModal}
      >
        <div className="flex min-h-[500px] rounded-lg outline-1 outline-neutral-700">
          <div className="flex flex-col space-y-1 rounded-l-lg bg-neutral-800 px-2 py-5 sm:w-1/5 md:w-1/4">
            <div className="hidden px-3 text-lg font-bold sm:block">{t('settings.title')}</div>
            <div className="pt-3" />

            {tabs.map((tab) => (
              <div
                key={tab.id}
                className={clsx(
                  'flex cursor-pointer items-center space-x-2 rounded-lg p-2 select-none sm:px-3',
                  currentTab === tab.id ? 'bg-neutral-700/70' : 'hover:bg-neutral-700'
                )}
                onClick={() => changeTab(tab.id)}
              >
                <div className="h-[16px] w-[16px]">{tab.icon}</div>

                {isUpdateAvailable && tab.id === 'update' ? (
                  <Badge dot color="blue" offset={[6, 3]}>
                    <span className="hidden truncate text-sm sm:block">
                      {t(`settings.${tab.id}.title`)}
                    </span>
                  </Badge>
                ) : (
                  <span className="hidden truncate text-sm sm:block">
                    {t(`settings.${tab.id}.title`)}
                  </span>
                )}
              </div>
            ))}
          </div>

          <div className="flex max-h-[700px] w-full flex-col items-center overflow-y-auto rounded-r-lg bg-neutral-900 px-3 sm:w-4/5 md:w-3/4">
            <div className="w-full max-w-[500px] py-10">
              <>{tabs.find((tab) => tab.id === currentTab)?.component}</>
            </div>
          </div>
        </div>
      </Modal>
    </>
  )
}
