import { ReactElement } from 'react'
import { Popover } from 'antd'
import { MonitorIcon } from 'lucide-react'

import { Device } from './device'
import { Resolution } from './resolution'
import { Scale } from './scale'

export const Video = (): ReactElement => {
  const content = (
    <div className="flex flex-col space-y-0.5">
      <Resolution />
      <Scale />
      <Device />
    </div>
  )

  return (
    <Popover content={content} placement="bottomLeft" trigger="click" arrow={false}>
      <div className="flex h-[28px] w-[28px] cursor-pointer items-center justify-center rounded text-white hover:bg-neutral-700/70">
        <MonitorIcon size={18} />
      </div>
    </Popover>
  )
}
