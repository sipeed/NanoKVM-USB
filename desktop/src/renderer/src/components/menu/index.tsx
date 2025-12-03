import { ReactElement, useEffect, useState } from 'react'
import { Divider } from 'antd'
import clsx from 'clsx'
import { MenuIcon, XIcon } from 'lucide-react'

import * as storage from '@renderer/libs/storage'

import { Fullscreen } from './fullscreen'
import { Keyboard } from './keyboard'
import { Mouse } from './mouse'
import { SerialPort } from './serial-port'
import { Settings } from './settings'
import { Video } from './video'
import { Recorder } from './recorder'

export const Menu = (): ReactElement => {
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  useEffect(() => {
    const isOpen = storage.getIsMenuOpen()
    setIsMenuOpen(isOpen)
  }, [])

  function toggleMenu(): void {
    setIsMenuOpen(!isMenuOpen)
  }

  return (
    <div className="fixed top-[10px] left-1/2 z-[1000] -translate-x-1/2">
      <div className="sticky top-[10px]">
        <div
          className={clsx(
            'h-[34px] items-center justify-between rounded bg-neutral-800/70 px-2',
            isMenuOpen ? 'flex' : 'hidden'
          )}
        >
          <Video />
          <SerialPort />
          <Divider type="vertical" className="px-[2px]" />

          <Mouse />
          <Keyboard />
          <Divider type="vertical" className="px-[2px]" />

          <Recorder />

          <Divider type="vertical" className="px-[2px]" />

          <Fullscreen />
          <Settings />
          <div
            className="flex h-[28px] cursor-pointer items-center justify-center rounded px-2 text-white hover:bg-neutral-700/70"
            onClick={toggleMenu}
          >
            <XIcon size={18} />
          </div>
        </div>

        {!isMenuOpen && (
          <div
            className="flex h-[30px] w-[35px] cursor-pointer items-center justify-center rounded bg-neutral-800/50 text-white/70 hover:bg-neutral-800 hover:text-white"
            onClick={toggleMenu}
          >
            <MenuIcon size={18} />
          </div>
        )}
      </div>
    </div>
  )
}
