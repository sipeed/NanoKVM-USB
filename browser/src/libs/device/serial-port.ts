export class SerialPort {
  instance: any;
  reader: ReadableStreamDefaultReader | null;
  writer: WritableStreamDefaultWriter | null;
  readonly TIMEOUT = 500; // 500ms

  constructor() {
    this.instance = null;
    this.reader = null;
    this.writer = null;
  }

  async init(port: any, baudRate: number = 57600) {
    try {
      if (this.instance) {
        await this.close();
      }

      this.instance = port;
      await this.instance.open({ baudRate });

      this.reader = this.instance.readable!.getReader();
      this.writer = this.instance.writable!.getWriter();
    } catch (err) {
      console.error('Error opening serial port:', err);
      throw err;
    }
  }

  async write(data: number[]) {
    if (!this.writer) {
      throw new Error('Serial port not initialized');
    }
    const uint8Array = new Uint8Array(data);
    await this.writer.write(uint8Array);
  }

  async read(minSize: number, sleep: number = 0): Promise<number[]> {
    if (!this.reader) {
      throw new Error('Serial port not initialized');
    }

    const result: number[] = [];
    const startTime = Date.now();

    while (result.length < minSize) {
      if (Date.now() - startTime > this.TIMEOUT) {
        return [];
      }

      const { value, done } = await this.reader.read();
      if (done) {
        break;
      }

      const data = Array.from(value) as number[];
      result.push(...data);
    }

    if (sleep > 0) {
      await new Promise((resolve) => setTimeout(resolve, sleep));
    }

    return result;
  }

  async close(): Promise<void> {
    if (this.reader) {
      await this.reader.cancel();
      this.reader.releaseLock();
    }
    if (this.writer) {
      await this.writer.close();
      this.writer.releaseLock();
    }
    if (this.instance) {
      await this.instance.close();
    }
  }
}
