import { device } from '@/libs/device';
import { MouseReportRelative } from '@/libs/mouse';

const MOUSE_JIGGLER_INTERVAL = 15_000;

class MouseJiggler {
  private lastMoveTime: number;
  private timer: number | null;
  private mode: 'enable' | 'disable';
  private mouseReport: MouseReportRelative;

  constructor() {
    this.lastMoveTime = Date.now();
    this.timer = null;
    this.mode = 'disable';
    this.mouseReport = new MouseReportRelative();
  }

  // enable or disable mouse jiggler
  setMode(mode: 'enable' | 'disable'): void {
    this.mode = mode;
    if (mode === 'disable' && this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    } else if (mode === 'enable' && this.timer === null) {
      this.timer = setInterval(() => {
        this.timeoutCallback();
      }, MOUSE_JIGGLER_INTERVAL / 5);
    }
  }

  // addEventListener to canvas on 'mousemove' event
  moveEventCallback(): void {
    if (this.mode === 'enable') {
      this.lastMoveTime = Date.now();
    }
  }

  timeoutCallback(): void {
    if (Date.now() - this.lastMoveTime > MOUSE_JIGGLER_INTERVAL) {
      this.lastMoveTime = Date.now() - 1_000;
      this.sendJiggle();
    }
  }

  async sendJiggle(): Promise<void> {
    const report1 = this.mouseReport.buildReport(10, 10, 0);
    const report2 = this.mouseReport.buildReport(-10, -10, 0);

    await device.sendKeyboardData([0x01, ...report1]);
    await device.sendKeyboardData([0x01, ...report2]);
  }
}

export const mouseJiggler = new MouseJiggler();
