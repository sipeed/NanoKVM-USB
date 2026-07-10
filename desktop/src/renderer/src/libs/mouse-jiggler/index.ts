import { IpcEvents } from '@common/ipc-events'
import { MouseReportRelative } from '@renderer/libs/mouse'

const MOUSE_JIGGLER_CHECK_MS = 3_000
const MOUSE_JIGGLER_MIN_IDLE = 30_000
const MOUSE_JIGGLER_MAX_IDLE = 60_000

class MouseJiggler {
  private lastMoveTime: number
  private timer: NodeJS.Timeout | null
  private mode: 'enable' | 'disable'
  private mouseReport: MouseReportRelative

  // Figure-8 (lemniscate) pattern state
  private figure8Step: number = 0
  private readonly FIGURE8_STEPS = 24
  private readonly BASE_AMPLITUDE = 35
  private isAnimating: boolean = false

  constructor() {
    this.lastMoveTime = Date.now()
    this.timer = null
    this.mode = 'disable'
    this.mouseReport = new MouseReportRelative()
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
      }, MOUSE_JIGGLER_CHECK_MS)
    }
  }

  // addEventListener to canvas on 'mousemove' event
  moveEventCallback(): void {
    if (this.mode === 'enable') {
      this.lastMoveTime = Date.now()
    }
  }

  timeoutCallback(): void {
    const idleThreshold = MOUSE_JIGGLER_MIN_IDLE + Math.random() * (MOUSE_JIGGLER_MAX_IDLE - MOUSE_JIGGLER_MIN_IDLE)
    if (Date.now() - this.lastMoveTime > idleThreshold && !this.isAnimating) {
      this.lastMoveTime = Date.now() - 1_000
      this.sendJiggle()
    }
  }

  /**
   * Draws 1 to almost-2 figure-8 (lemniscate) loops, never completing exactly
   * 2 full loops so the pointer never ends up back at its starting position.
   */
  async sendJiggle(): Promise<void> {
    this.isAnimating = true

    const totalDuration = 5_000 + Math.random() * 5_000 // 5-10 seconds
    const amp = this.BASE_AMPLITUDE + (Math.random() - 0.5) * 12
    const vertical = Math.random() > 0.5
    // Range [FIGURE8_STEPS + 1, 2 * FIGURE8_STEPS - 1] = [25, 47]
    const loopSteps = this.FIGURE8_STEPS + 1 + Math.random() * (this.FIGURE8_STEPS - 2)

    // --- Helper: generate variable delays totaling exactly a budget ---
    const generateDelays = (steps: number, budget: number, minDelay: number): number[] => {
      const extra = budget - minDelay * steps
      const weights = Array.from({ length: steps }, () => Math.random())
      const sum = weights.reduce((a, b) => a + b, 0)
      return weights.map((w) => minDelay + (w / sum) * extra)
    }

    const figure8Delays = generateDelays(loopSteps, totalDuration, 20)

    // --- Phase 1: draw figure-8 loop(s) ---
    for (let i = 0; i < loopSteps; i++) {
      const t = (this.figure8Step / this.FIGURE8_STEPS) * 2 * Math.PI
      const tNext = ((this.figure8Step + 1) / this.FIGURE8_STEPS) * 2 * Math.PI

      const sinT = amp * Math.sin(t)
      const sin2T = (amp * Math.sin(2 * t)) / 2
      const sinTNext = amp * Math.sin(tNext)
      const sin2TNext = (amp * Math.sin(2 * tNext)) / 2

      const x = vertical ? sin2T : sinT
      const y = vertical ? sinT : sin2T
      const xNext = vertical ? sin2TNext : sinTNext
      const yNext = vertical ? sinTNext : sin2TNext

      const dx = Math.round(xNext - x)
      const dy = Math.round(yNext - y)

      const report = this.mouseReport.buildReport(dx, dy, 0)
      await window.electron.ipcRenderer.invoke(IpcEvents.SEND_MOUSE, [0x01, ...report])

      this.figure8Step = (this.figure8Step + 1) % this.FIGURE8_STEPS
      await new Promise((resolve) => setTimeout(resolve, figure8Delays[i]))
    }

    this.isAnimating = false
  }
}

export const mouseJiggler = new MouseJiggler()
