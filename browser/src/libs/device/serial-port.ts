import { isDisconnectError, raceWithTimeout } from './utils';

type WebSerialPort = {
  open: (options: { baudRate: number }) => Promise<void>;
  close: () => Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
};

type Options = {
  port: WebSerialPort;
  baudRate?: number;
  onDisconnect?: () => void;
};

export class SerialPort {
  readonly SERIAL_BAUD_RATE = 57600;
  readonly READ_TIMEOUT = 500;
  readonly CLEANUP_TIMEOUT = 1000;

  private instance: WebSerialPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private onDisconnect?: () => void;

  private disconnectHandler = (event: Event) => {
    if (event.target === this.instance) {
      this.handleDisconnect();
    }
  };

  async init(options: Options): Promise<void> {
    if (this.instance) {
      await this.close();
    }

    try {
      this.instance = options.port;
      const baudRate = options.baudRate || this.SERIAL_BAUD_RATE;
      await this.instance.open({ baudRate });
    } catch (err) {
      this.instance = null;
      console.error('Error opening serial port:', err);
      throw err;
    }

    if (!this.instance.readable || !this.instance.writable) {
      this.instance = null;
      throw new Error('Serial port streams not available');
    }

    this.reader = this.instance.readable.getReader();
    this.writer = this.instance.writable.getWriter();

    if (options.onDisconnect) {
      this.onDisconnect = options.onDisconnect;
    }

    navigator.serial.addEventListener('disconnect', this.disconnectHandler);
  }

  private handleDisconnect(): void {
    if (!this.instance) return;

    this.releaseReader();
    this.releaseWriter();

    this.instance = null;

    if (this.onDisconnect) {
      this.onDisconnect();
      this.onDisconnect = undefined;
    }

    navigator.serial.removeEventListener('disconnect', this.disconnectHandler);
  }

  private releaseReader(): void {
    if (!this.reader) return;
    try {
      this.reader.releaseLock();
    } catch {
      // Lock already released
    }
    this.reader = null;
  }

  private releaseWriter(): void {
    if (!this.writer) return;
    try {
      this.writer.releaseLock();
    } catch {
      // Lock already released
    }
    this.writer = null;
  }

  async write(data: number[]): Promise<void> {
    if (!this.writer) {
      throw new Error('Serial port not initialized');
    }

    try {
      await this.writer.write(new Uint8Array(data));
    } catch (err) {
      if (isDisconnectError(err)) {
        this.handleDisconnect();
        throw new Error('Device disconnected');
      }
      throw err;
    }
  }

  async read(minSize: number, delayAfterRead: number = 0): Promise<number[]> {
    if (!this.reader) {
      throw new Error('Serial port not initialized');
    }

    const result: number[] = [];
    const startTime = Date.now();

    try {
      while (result.length < minSize) {
        const remainingTime = this.READ_TIMEOUT - (Date.now() - startTime);
        if (remainingTime <= 0) return [];

        const response = await raceWithTimeout(this.reader.read(), remainingTime);
        if (!response || response.done || !response.value) break;

        result.push(...Array.from(response.value));
      }

      if (delayAfterRead > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayAfterRead));
      }

      return result;
    } catch (err) {
      if (isDisconnectError(err)) {
        this.handleDisconnect();
        throw new Error('Device disconnected');
      }
      throw err;
    }
  }

  async close(): Promise<void> {
    try {
      if (this.reader) {
        await raceWithTimeout(
          this.reader.cancel().catch(() => {}),
          this.CLEANUP_TIMEOUT
        );
        this.releaseReader();
      }

      if (this.writer) {
        await raceWithTimeout(
          this.writer.close().catch(() => {}),
          this.CLEANUP_TIMEOUT
        );
        this.releaseWriter();
      }

      if (this.instance) {
        await this.instance.close().catch(() => {});
        this.instance = null;
      }

      navigator.serial.removeEventListener('disconnect', this.disconnectHandler);
    } catch (err) {
      console.error('Error during close:', err);
    }
  }
}
