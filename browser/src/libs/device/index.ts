import { CmdEvent, CmdPacket, InfoPacket } from './proto.ts';
import { SerialPort } from './serial-port.ts';

export class Device {
  addr: number;
  serialPort: SerialPort;

  constructor() {
    this.addr = 0x00;
    this.serialPort = new SerialPort();
  }

  async getInfo() {
    const data = new CmdPacket(this.addr, CmdEvent.GET_INFO).encode();
    await this.serialPort.write(data);

    const rsp = await this.serialPort.read(14);
    const rspPacket = new CmdPacket(-1, -1, rsp);
    return new InfoPacket(rspPacket.DATA);
  }

  async sendKeyboardData(report: number[]): Promise<void> {
    const cmdData = new CmdPacket(this.addr, CmdEvent.SEND_KB_GENERAL_DATA, report).encode();
    await this.serialPort.write(cmdData);
  }

  async sendMouseData(report: number[]): Promise<void> {
    if (report.length === 0) return;

    const cmdEvent = report[0] === 0x01 ? CmdEvent.SEND_MS_REL_DATA : CmdEvent.SEND_MS_ABS_DATA;
    const cmdData = new CmdPacket(this.addr, cmdEvent, report).encode();
    await this.serialPort.write(cmdData);
  }
}

export const device = new Device();
