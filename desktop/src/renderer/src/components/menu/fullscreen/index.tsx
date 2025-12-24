import { ReactElement, useState } from 'react'
import { MaximizeIcon, MinimizeIcon } from 'lucide-react'

import { IpcEvents } from '@common/ipc-events'

export const Fullscreen = (): ReactElement => {
  const [isFullscreen, setIsFullscreen] = useState(false)

  function handleFullscreen(): void {
    const fullscreen = !isFullscreen

    window.electron.ipcRenderer.send(IpcEvents.SET_FULL_SCREEN, fullscreen)
    setIsFullscreen(fullscreen)
  }

  return (
    <div
      className="flex h-[28px] w-[28px] cursor-pointer items-center justify-center rounded text-white hover:bg-neutral-700/70"
      onClick={handleFullscreen}
    >
      {isFullscreen ? <MinimizeIcon size={18} /> : <MaximizeIcon size={18} />}
    </div>
  )
}
