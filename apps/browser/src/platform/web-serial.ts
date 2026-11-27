import type { OpenSerialPortOptions, SerialPortInfo, SerialTransport } from '@nanokvm/core'

type WebSerialPort = {
  open: (options: { baudRate: number }) => Promise<void>
  close: () => Promise<void>
  readable: ReadableStream<Uint8Array> | null
  writable: WritableStream<Uint8Array> | null
}

type SerialApi = {
  requestPort: () => Promise<WebSerialPort>
  addEventListener: (type: 'disconnect', listener: (event: Event) => void) => void
  removeEventListener: (type: 'disconnect', listener: (event: Event) => void) => void
}

const READ_TIMEOUT = 500
const CLEANUP_TIMEOUT = 1000

function raceWithTimeout<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([
    promise,
    new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), ms))
  ])
}

function isDisconnectError(err: unknown): boolean {
  if (!(err instanceof Error)) return false

  const { name, message = '' } = err
  const msg = message.toLowerCase()

  return (
    name === 'NetworkError' ||
    name === 'InvalidStateError' ||
    name === 'NotFoundError' ||
    msg.includes('disconnected') ||
    msg.includes('device has been lost') ||
    msg.includes('the device has been closed')
  )
}

function getSerialApi(): SerialApi | undefined {
  return (navigator as Navigator & { serial?: SerialApi }).serial
}

/**
 * Web Serial 传输层实现。
 *
 * `request()` 必须由用户手势触发（浏览器安全限制）；`open()` 打开最近一次选中的端口。
 */
export class WebSerialTransport implements SerialTransport {
  readonly kind = 'web-serial' as const

  private requestedPort: WebSerialPort | null = null
  private instance: WebSerialPort | null = null
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null
  private disconnectCallbacks = new Set<() => void>()

  private disconnectHandler = (event: Event) => {
    if (event.target === this.instance) {
      this.handleDisconnect()
    }
  }

  isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'serial' in navigator
  }

  supportsEnumeration(): boolean {
    return false
  }

  async list(): Promise<SerialPortInfo[]> {
    return []
  }

  async request(): Promise<void> {
    const serial = getSerialApi()
    if (!serial) {
      throw new Error('Web Serial is not supported')
    }

    this.requestedPort = await serial.requestPort()
  }

  async open(options: OpenSerialPortOptions): Promise<void> {
    const serial = getSerialApi()
    if (!serial) {
      throw new Error('Web Serial is not supported')
    }

    if (this.instance) {
      await this.close()
    }

    const port = this.requestedPort
    if (!port) {
      throw new Error('No serial port has been selected')
    }

    this.instance = port

    try {
      await port.open({ baudRate: options.baudRate })
    } catch (err) {
      this.instance = null
      throw err
    }

    if (!port.readable || !port.writable) {
      this.instance = null
      throw new Error('Serial port streams are not available')
    }

    this.reader = port.readable.getReader()
    this.writer = port.writable.getWriter()

    serial.addEventListener('disconnect', this.disconnectHandler)
  }

  onDisconnect(callback: () => void): () => void {
    this.disconnectCallbacks.add(callback)
    return () => {
      this.disconnectCallbacks.delete(callback)
    }
  }

  async write(data: number[]): Promise<void> {
    if (!this.writer) {
      throw new Error('Serial port is not open')
    }

    try {
      await this.writer.write(new Uint8Array(data))
    } catch (err) {
      if (isDisconnectError(err)) {
        this.handleDisconnect()
        throw new Error('Device disconnected', { cause: err })
      }
      throw err
    }
  }

  async read(minSize: number, timeoutMs: number = READ_TIMEOUT): Promise<number[]> {
    if (!this.reader) {
      throw new Error('Serial port is not open')
    }

    const result: number[] = []
    const startTime = Date.now()

    try {
      while (result.length < minSize) {
        const remainingTime = timeoutMs - (Date.now() - startTime)
        if (remainingTime <= 0) return result

        const response = await raceWithTimeout(this.reader.read(), remainingTime)
        if (!response || response.done || !response.value) break

        result.push(...Array.from(response.value))
      }

      return result
    } catch (err) {
      if (isDisconnectError(err)) {
        this.handleDisconnect()
        throw new Error('Device disconnected', { cause: err })
      }
      throw err
    }
  }

  async close(): Promise<void> {
    const serial = getSerialApi()

    try {
      if (this.reader) {
        await raceWithTimeout(
          this.reader.cancel().catch(() => {}),
          CLEANUP_TIMEOUT
        )
        this.releaseReader()
      }

      if (this.writer) {
        await raceWithTimeout(
          this.writer.close().catch(() => {}),
          CLEANUP_TIMEOUT
        )
        this.releaseWriter()
      }

      if (this.instance) {
        await this.instance.close().catch(() => {})
        this.instance = null
      }

      serial?.removeEventListener('disconnect', this.disconnectHandler)
    } catch (err) {
      console.error('Error while closing serial port:', err)
    }
  }

  private releaseReader(): void {
    if (!this.reader) return
    try {
      this.reader.releaseLock()
    } catch {
      // lock already released
    }
    this.reader = null
  }

  private releaseWriter(): void {
    if (!this.writer) return
    try {
      this.writer.releaseLock()
    } catch {
      // lock already released
    }
    this.writer = null
  }

  private handleDisconnect(): void {
    if (!this.instance) return

    this.releaseReader()
    this.releaseWriter()
    this.instance = null

    const serial = getSerialApi()
    serial?.removeEventListener('disconnect', this.disconnectHandler)

    for (const callback of this.disconnectCallbacks) {
      callback()
    }
  }
}
