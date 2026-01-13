import { CmdEvent, CmdPacket, InfoPacket } from './proto'
import { SerialPort } from './serial-port'
import { intToByte, intToLittleEndianList } from './utils'

export class Device {
  addr: number
  serialPort: SerialPort

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

  async sendKeyboardData(data: number[]): Promise<void> {
    const cmdData = new CmdPacket(this.addr, CmdEvent.SEND_KB_GENERAL_DATA, data).encode()
    await this.serialPort.write(cmdData)
  }

  async sendMouseRelativeData(key: number, x: number, y: number, scroll: number): Promise<void> {
    const xByte = intToByte(x)
    const yByte = intToByte(y)

    const data = [0x01, key, xByte, yByte, scroll]
    const cmdData = new CmdPacket(this.addr, CmdEvent.SEND_MS_REL_DATA, data).encode()
    await this.serialPort.write(cmdData)
  }

  async sendMouseAbsoluteData(
    key: number,
    width: number,
    height: number,
    x: number,
    y: number,
    scroll: number
  ): Promise<void> {
    const xAbs = width === 0 ? 0 : Math.floor((x * 4096) / width)
    const xLittle = intToLittleEndianList(xAbs)

    const yAbs = width === 0 ? 0 : Math.floor((y * 4096) / height)
    const yLittle = intToLittleEndianList(yAbs)

    const data = [0x02, key, ...xLittle, ...yLittle, scroll]
    const cmdData = new CmdPacket(this.addr, CmdEvent.SEND_MS_ABS_DATA, data).encode()
    await this.serialPort.write(cmdData)
  }
}

export const device = new Device()
