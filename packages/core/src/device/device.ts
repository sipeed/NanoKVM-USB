import { CmdEvent, CmdPacket, InfoPacket } from './proto'
import type { SerialTransport } from './transport'

/**
 * 设备门面：只依赖 SerialTransport，负责协议编解码。
 *
 * 两端共用同一份实现，平台差异全部下沉到 Transport。
 */
export class Device {
  readonly transport: SerialTransport
  addr: number

  constructor(transport: SerialTransport, addr: number = 0x00) {
    this.transport = transport
    this.addr = addr
  }

  get isSupported(): boolean {
    return this.transport.isSupported()
  }

  async getInfo(): Promise<InfoPacket> {
    const data = new CmdPacket(this.addr, CmdEvent.GET_INFO).encode()
    await this.transport.write(data)

    const rsp = await this.transport.read(14)
    const rspPacket = new CmdPacket(-1, -1, rsp)
    return new InfoPacket(rspPacket.DATA)
  }

  async sendKeyboardData(report: number[]): Promise<void> {
    const cmdData = new CmdPacket(this.addr, CmdEvent.SEND_KB_GENERAL_DATA, report).encode()
    await this.transport.write(cmdData)
  }

  async sendMouseData(report: number[]): Promise<void> {
    if (report.length === 0) return

    const cmdEvent = report[0] === 0x01 ? CmdEvent.SEND_MS_REL_DATA : CmdEvent.SEND_MS_ABS_DATA
    const cmdData = new CmdPacket(this.addr, cmdEvent, report).encode()
    await this.transport.write(cmdData)
  }
}

export function createDevice(transport: SerialTransport): Device {
  return new Device(transport)
}
