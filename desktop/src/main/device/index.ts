import { CmdEvent, CmdPacket, InfoPacket } from './proto'
import { SerialPort } from './serial-port'

export class Device {
  addr: number
  serialPort: SerialPort
  private lastAbsX: number = 0
  private lastAbsY: number = 0

  constructor() {
    this.addr = 0x00
    this.serialPort = new SerialPort()
  }

  async getInfo(): Promise<InfoPacket> {
    const data = new CmdPacket(this.addr, CmdEvent.GET_INFO).encode()
    await this.serialPort.write(data)

    const rsp = await this.serialPort.read(14)
    const rspPacket = new CmdPacket(-1, -1, rsp)
    return new InfoPacket(rspPacket.DATA)
  }

  async sendKeyboardData(report: number[]): Promise<void> {
    const cmdData = new CmdPacket(this.addr, CmdEvent.SEND_KB_GENERAL_DATA, report).encode()
    await this.serialPort.write(cmdData)
  }

  async sendMouseData(report: number[]): Promise<void> {
    if (report.length === 0) return

    // Absolute reports declare 5 buttons; track last position so side-button
    // injections from the main process don't teleport the cursor.
    if (report[0] === 0x02 && report.length >= 7) {
      this.lastAbsX = report[2] | (report[3] << 8)
      this.lastAbsY = report[4] | (report[5] << 8)
    }

    const cmdEvent = report[0] === 0x01 ? CmdEvent.SEND_MS_REL_DATA : CmdEvent.SEND_MS_ABS_DATA
    const cmdData = new CmdPacket(this.addr, cmdEvent, report).encode()
    await this.serialPort.write(cmdData)
  }

  getLastAbsPosition(): { x: number; y: number } {
    return { x: this.lastAbsX, y: this.lastAbsY }
  }
}

export const device = new Device()
