import { IpcEvents } from '@common/ipc-events'
import type { Mouse as MouseKey } from '@renderer/types'

const MOUSE_JIGGLER_INTERVAL = 15_000
const EMPTY_KEY: MouseKey = { left: false, right: false, mid: false }

class MouseJiggler {
  private lastMoveTime: number
  private timer: NodeJS.Timeout | null
  private mode: 'enable' | 'disable'

  constructor() {
    this.lastMoveTime = Date.now()
    this.timer = null
    this.mode = 'disable'
  }

  // enable or disable mouse jiggler
  setMode(mode: 'enable' | 'disable'): void {
    this.mode = mode
    if (mode === 'disable' && this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    } else if (mode === 'enable' && this.timer === null) {
      this.timer = setInterval(() => {
        this.timeoutCallback()
      }, MOUSE_JIGGLER_INTERVAL / 5)
    }
  }

  // addEventListener to canvas on 'mousemove' event
  moveEventCallback(): void {
    if (this.mode === 'enable') {
      this.lastMoveTime = Date.now()
    }
  }

  timeoutCallback(): void {
    if (Date.now() - this.lastMoveTime > MOUSE_JIGGLER_INTERVAL) {
      this.lastMoveTime = Date.now() - 1_000
      this.sendJiggle()
    }
  }

  async sendJiggle(): Promise<void> {
    await window.electron.ipcRenderer.invoke(IpcEvents.SEND_MOUSE_RELATIVE, EMPTY_KEY, 10, 10, 0)
    await window.electron.ipcRenderer.invoke(IpcEvents.SEND_MOUSE_RELATIVE, EMPTY_KEY, -10, -10, 0)
  }
}
export const mouseJiggler = new MouseJiggler()
