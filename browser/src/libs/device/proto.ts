export enum CmdEvent {
  GET_INFO = 0x01,
  SEND_KB_GENERAL_DATA = 0x02,
  SEND_KB_MEDIA_DATA = 0x03,
  SEND_MS_ABS_DATA = 0x04,
  SEND_MS_REL_DATA = 0x05,
  SEND_MY_HID_DATA = 0x06,
  READ_MY_HID_DATA = 0x87,
  GET_PARA_CFG = 0x08,
  SET_PARA_CFG = 0x09,
  GET_USB_STRING = 0x0a,
  SET_USB_STRING = 0x0b,
  SET_DEFAULT_CFG = 0x0c,
  RESET = 0x0f
}

export class CmdPacket {
  readonly HEAD1: number = 0x57;
  readonly HEAD2: number = 0xab;

  ADDR: number = 0x00;
  CMD: number = 0x00;
  LEN: number = 0x00;
  DATA: number[] = [];
  SUM: number = 0x00;

  constructor(addr: number = 0x00, cmd: number = 0x00, data: number[] = []) {
    if (addr < 0 || cmd < 0) {
      this.decode(data);
      return;
    }
    this.save(addr, cmd, data);
  }

  encode(): number[] {
    return [this.HEAD1, this.HEAD2, this.ADDR, this.CMD, this.LEN, ...this.DATA, this.SUM];
  }

  public decode(data: number[]): number {
    const headerIndex = this.findHead(data);
    if (headerIndex < 0) {
      console.log('cannot find HEAD');
      return -1;
    }

    if (data.length - headerIndex < 6) {
      console.log('len error1');
      return -1;
    }

    const addr = data[headerIndex + 2];
    const cmd = data[headerIndex + 3];
    const dataLen = data[headerIndex + 4];

    if (data.length < headerIndex + 3 + dataLen + 1) {
      console.log('len error2');
      return -1;
    }

    let sum: number;
    try {
      sum = data[headerIndex + 5 + dataLen];
    } catch {
      console.log('len error3');
      return -1;
    }

    let s = 0;
    for (let i = headerIndex; i < headerIndex + 4 + dataLen; i++) {
      s += data[i];
    }

    if ((s & 0xff) !== sum) {
      // console.log(`sum error, sum${sum}, s${s & 0xff}`);
      return -1;
    }

    this.ADDR = addr;
    this.CMD = cmd;
    this.LEN = dataLen;
    this.DATA = data.slice(headerIndex + 5, headerIndex + 5 + this.LEN);
    this.SUM = sum;
    return 0;
  }

  private findHead(lst: number[]): number {
    const subsequence = [this.HEAD1, this.HEAD2];
    const subseqLen = subsequence.length;
    for (let i = 0; i <= lst.length - subseqLen; i++) {
      if (lst.slice(i, i + subseqLen).every((val, index) => val === subsequence[index])) {
        return i;
      }
    }
    return -1;
  }

  private save(addr: number, cmd: number, data: number[]): void {
    this.ADDR = addr;
    this.CMD = cmd;
    this.DATA = data;
    this.LEN = data.length;
    this.SUM = this.HEAD1 + this.HEAD2 + this.ADDR + this.CMD + this.LEN;
    for (const i of this.DATA) {
      this.SUM += i;
    }
    this.SUM &= 0xff;
  }
}

export class InfoPacket {
  CHIP_VERSION: string = 'V0.0';
  IS_CONNECTED: boolean = false;
  NUM_LOCK: boolean = false;
  CAPS_LOCK: boolean = false;
  SCROLL_LOCK: boolean = false;

  constructor(data: number[]) {
    if (data[0] < 0x30) {
      throw new Error('version error');
    }

    const versionE = data[0] - 0x30;
    const version = 1.0 + versionE / 10;
    this.CHIP_VERSION = `V${version.toFixed(1)}`;

    this.IS_CONNECTED = data[1] !== 0;

    this.NUM_LOCK = getBit(data[2], 0) === 1;
    this.CAPS_LOCK = getBit(data[2], 1) === 1;
    this.SCROLL_LOCK = getBit(data[2], 2) === 1;
  }
}

function getBit(number: number, bitPosition: number): number {
  return (number >> bitPosition) & 1;
}
