// Maximum absolute coordinate value
const MAX_ABS_COORD = 4096;

// Button bit positions
const MouseButtons = {
  Left: 1 << 0,
  Right: 1 << 1,
  Middle: 1 << 2,
  Back: 1 << 3,
  Forward: 1 << 4
} as const;

// Map browser button index to HID bit
function getMouseButtonBit(button: number): number {
  switch (button) {
    case 0:
      return MouseButtons.Left;
    case 1:
      return MouseButtons.Middle;
    case 2:
      return MouseButtons.Right;
    case 3:
      return MouseButtons.Back;
    case 4:
      return MouseButtons.Forward;
    default:
      return 0;
  }
}

/**
 * Relative Mouse Report (4 bytes)
 *
 * Byte 0: Buttons
 * Byte 1: X movement (-127 to 127)
 * Byte 2: Y movement (-127 to 127)
 * Byte 3: Wheel (-127 to 127)
 */
export class MouseReportRelative {
  private buttons: number = 0;

  buttonDown(button: number): void {
    this.buttons |= getMouseButtonBit(button);
  }

  buttonUp(button: number): void {
    this.buttons &= ~getMouseButtonBit(button);
  }

  /**
   * Build relative mouse report
   * @param deltaX X movement (-127 to 127)
   * @param deltaY Y movement (-127 to 127)
   * @param wheel Scroll wheel (-127 to 127, negative = down)
   */
  buildReport(deltaX: number, deltaY: number, wheel: number = 0): number[] {
    const x = this.clamp(Math.round(deltaX), -127, 127) & 0xff;
    const y = this.clamp(Math.round(deltaY), -127, 127) & 0xff;
    const scroll = this.clamp(Math.round(wheel), -127, 127) & 0xff;
    return [this.buttons, x, y, scroll];
  }

  /**
   * Build button-only report (no movement)
   */
  buildButtonReport(): number[] {
    return this.buildReport(0, 0, 0);
  }

  reset(): number[] {
    this.buttons = 0;
    return this.buildReport(0, 0, 0);
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }
}

/**
 * Absolute Mouse Report (6 bytes)
 *
 * Byte 0: Buttons
 * Byte 1-2: X position (0 to 32767, Little Endian)
 * Byte 3-4: Y position (0 to 32767, Little Endian)
 * Byte 5: Wheel
 */
export class MouseAbsoluteRelative {
  private buttons: number = 0;

  buttonDown(button: number): void {
    this.buttons |= getMouseButtonBit(button);
  }

  buttonUp(button: number): void {
    this.buttons &= ~getMouseButtonBit(button);
  }

  /**
   * Build absolute mouse report
   * @param x X position (0.0 to 1.0, normalized)
   * @param y Y position (0.0 to 1.0, normalized)
   * @param wheel Scroll wheel (-127 to 127)
   */
  buildReport(x: number, y: number, wheel: number = 0): number[] {
    // Convert normalized coordinates (0-1) to absolute coordinates (0-4096)
    const xAbs = Math.floor(Math.max(0, Math.min(1, x)) * MAX_ABS_COORD);
    const yAbs = Math.floor(Math.max(0, Math.min(1, y)) * MAX_ABS_COORD);

    const x1 = xAbs & 0xff;
    const x2 = (xAbs >> 8) & 0xff;
    const y1 = yAbs & 0xff;
    const y2 = (yAbs >> 8) & 0xff;
    const scroll = this.clamp(Math.round(wheel), -127, 127) & 0xff;

    return [this.buttons, x1, x2, y1, y2, scroll];
  }

  /**
   * Build button-only report (keeps last position)
   */
  buildButtonReport(lastX: number, lastY: number): number[] {
    return this.buildReport(lastX, lastY, 0);
  }

  reset(): number[] {
    this.buttons = 0;
    return this.buildReport(0, 0, 0);
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }
}
