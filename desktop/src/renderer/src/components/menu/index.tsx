import { ReactElement, useCallback, useEffect, useRef, useState } from 'react'
import { Divider } from 'antd'
import clsx from 'clsx'
import { ChevronRightIcon, GripVerticalIcon, XIcon } from 'lucide-react'
import Draggable from 'react-draggable'

import * as storage from '@renderer/libs/storage'

import { Keyboard } from './keyboard'
import { Mouse } from './mouse'
import { Recorder } from './recorder'
import { SerialPort } from './serial-port'
import { Settings } from './settings'
import { Video } from './video'

export const Menu = (): ReactElement => {
  const [isMenuOpen, setIsMenuOpen] = useState(true)
  const [menuBounds, setMenuBounds] = useState({ left: 0, right: 0, top: 0, bottom: 0 })
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [initialized, setInitialized] = useState(false)

  const nodeRef = useRef<HTMLDivElement | null>(null)

  const handleResize = useCallback(() => {
    if (!nodeRef.current) return

    const { innerWidth, innerHeight } = window
    const { offsetWidth, offsetHeight } = nodeRef.current

    setMenuBounds({
      left: 0,
      top: 0,
      right: innerWidth - offsetWidth,
      bottom: innerHeight - offsetHeight
    })
  }, [])

  const initializePosition = useCallback(() => {
    if (!nodeRef.current || initialized) return

    const { innerWidth } = window

    requestAnimationFrame(() => {
      if (!nodeRef.current) return
      const width = nodeRef.current.offsetWidth
      setPosition({
        x: (innerWidth - width) / 2,
        y: 10
      })
      setInitialized(true)
    })
  }, [initialized])

  useEffect(() => {
    const isOpen = storage.getIsMenuOpen()
    setIsMenuOpen(isOpen)

    window.addEventListener('resize', handleResize)

    const observer = new ResizeObserver(() => {
      handleResize()
    })

    if (nodeRef.current) {
      observer.observe(nodeRef.current)
    }

    return () => {
      window.removeEventListener('resize', handleResize)
      observer.disconnect()
    }
  }, [handleResize])

  useEffect(() => {
    handleResize()
    initializePosition()
  }, [isMenuOpen, handleResize, initializePosition])

  function toggleMenu(): void {
    setIsMenuOpen(!isMenuOpen)
  }

  return (
    <Draggable
      nodeRef={nodeRef}
      bounds={menuBounds}
      handle="strong"
      position={position}
      onDrag={(_, data) => setPosition({ x: data.x, y: data.y })}
    >
      <div ref={nodeRef} className="fixed top-0 left-0 z-[1000]">
        {/* Menubar */}
        <div className="sticky top-[10px] flex w-full justify-center">
          <div
            className={clsx(
              'h-[34px] items-center justify-between rounded bg-neutral-800/70 pr-2 pl-1 transition-all duration-300',
              isMenuOpen ? 'flex' : 'hidden'
            )}
          >
            <strong>
              <div className="flex h-[28px] cursor-move items-center justify-center pl-1 text-neutral-500 select-none">
                <GripVerticalIcon size={18} />
              </div>
            </strong>
            <Divider type="vertical" />

            <Video />
            <SerialPort />
            <Divider type="vertical" className="px-0.5" />

            <Keyboard />
            <Mouse />
            <Recorder />

            <Divider type="vertical" className="px-0.5" />

            <Settings />
            <div
              className="flex h-[28px] cursor-pointer items-center justify-center rounded px-2 text-white hover:bg-neutral-700/70"
              onClick={toggleMenu}
            >
              <XIcon size={18} />
            </div>
          </div>

          {/* Menubar expand button */}
          {!isMenuOpen && (
            <div className="flex items-center rounded-lg bg-neutral-800/50 p-1">
              <strong>
                <div className="flex size-[26px] cursor-move items-center justify-center text-neutral-500 select-none">
                  <GripVerticalIcon size={18} />
                </div>
              </strong>
              <Divider type="vertical" style={{ margin: '0 4px' }} />
              <div
                className="flex size-[26px] cursor-pointer items-center justify-center rounded text-neutral-500 hover:bg-neutral-800/60 hover:text-white"
                onClick={toggleMenu}
              >
                <ChevronRightIcon size={18} />
              </div>
            </div>
          )}
        </div>
      </div>
    </Draggable>
  )
}
