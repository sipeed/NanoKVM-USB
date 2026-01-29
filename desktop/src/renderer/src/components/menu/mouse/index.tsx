import { ReactElement, useEffect, useState } from 'react'
import { Divider, Popover } from 'antd'
import { useAtom, useSetAtom } from 'jotai'
import { MouseIcon } from 'lucide-react'

import {
  mouseJigglerModeAtom,
  mouseModeAtom,
  mouseStyleAtom,
  scrollDirectionAtom,
  scrollIntervalAtom
} from '@renderer/jotai/mouse'
import { mouseJiggler } from '@renderer/libs/mouse-jiggler'
import * as storage from '@renderer/libs/storage'

import { Direction } from './direction'
import { Jiggler } from './jiggler'
import { AutoClicker } from './auto-clicker'
import { Mode } from './mode'
import { Speed } from './speed'
import { Style } from './style'

export const Mouse = (): ReactElement => {
  const [mouseStyle, setMouseStyle] = useAtom(mouseStyleAtom)
  const setMouseMode = useSetAtom(mouseModeAtom)
  const setScrollDirection = useSetAtom(scrollDirectionAtom)
  const setScrollInterval = useSetAtom(scrollIntervalAtom)
  const setMouseJigglerMode = useSetAtom(mouseJigglerModeAtom)

  const [isPopoverOpen, setIsPopoverOpen] = useState(false)

  useEffect(() => {
    const style = storage.getMouseStyle()
    if (style && style !== mouseStyle) {
      setMouseStyle(style)
    }

    const mode = storage.getMouseMode()
    if (mode) {
      setMouseMode(mode)
    }

    const direction = storage.getMouseScrollDirection()
    if (direction) {
      setScrollDirection(direction > 0 ? 1 : -1)
    }

    const interval = storage.getMouseScrollInterval()
    if (interval) {
      setScrollInterval(interval)
    }
    const jiggler = storage.getMouseJigglerMode()
    mouseJiggler.setMode(jiggler)
    setMouseJigglerMode(jiggler)
  }, [])

  const content = (
    <div className="flex flex-col space-y-1">
      <Style />
      <Mode />
      <Direction />
      <Speed />

      <Divider style={{ margin: '6px 0', opacity: '0.5' }} />

      <Jiggler />
      <AutoClicker />
    </div>
  )

  return (
    <Popover
      content={content}
      placement="bottomLeft"
      trigger="click"
      arrow={false}
      open={isPopoverOpen}
      onOpenChange={setIsPopoverOpen}
    >
      <div className="flex h-[28px] cursor-pointer items-center justify-center rounded px-2 text-white hover:bg-neutral-700/70">
        <MouseIcon size={18} />
      </div>
    </Popover>
  )
}
