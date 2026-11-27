import { SerialPort as SP } from 'serialport'

type Options = {
  path: string
  baudRate?: number
  onDisconnect?: () => void
}

/**
 * 桌面端串口字节传输。
 *
 * 只负责打开/关闭串口、收发原始字节以及断连通知，
 * 不包含任何协议编解码逻辑（协议已上移到 `@nanokvm/core`）。
 */
export class SerialPort {
  readonly SERIAL_BAUD_RATE = 57600
  readonly READ_TIMEOUT = 500

  /**
   * 接收缓冲上限。协议单次读取只有十几字节，正常情况下缓冲不会超过这个量。
   * 设置硬上限是为了防止异常/持续上报的设备把内存吃满（旧实现只进不出）。
   */
  private readonly MAX_BUFFER_SIZE = 1024 * 1024

  private port: SP | null = null
  private onDisconnect?: () => void
  private buffer: number[] = []
  private waiters: Array<() => void> = []

  async init(options: Options): Promise<void> {
    try {
      if (this.port?.isOpen) {
        await this.close()
        await new Promise((resolve) => setTimeout(resolve, 100))
      }

      const path = options.path
      const baudRate = options.baudRate || this.SERIAL_BAUD_RATE

      this.buffer = []

      const port = await new Promise<SP>((resolve, reject) => {
        const instance = new SP({ path, baudRate }, (err) => {
          if (err) {
            reject(err)
          } else {
            resolve(instance)
          }
        })

        // 打开失败时 serialport 可能同时 emit 'error'，先挂空监听避免进程崩溃
        instance.on('error', () => {})
      })

      this.port = port

      if (options.onDisconnect) {
        this.onDisconnect = options.onDisconnect
      }

      port.on('data', this.handleData)

      port.on('close', () => {
        console.warn('Serial port closed event received')
        this.handleDisconnect()
      })

      port.on('error', (err) => {
        console.error('Serial port error:', err)
        if (this.isDisconnectError(err)) {
          this.handleDisconnect()
        }
      })
    } catch (err) {
      console.error('Error opening serial port:', err)
      throw err
    }
  }

  private handleData = (data: Buffer): void => {
    for (const byte of data) {
      this.buffer.push(byte)
    }

    if (this.buffer.length > this.MAX_BUFFER_SIZE) {
      // 丢弃最旧的字节，保证内存有界；正常协议读取不会触发到这里
      this.buffer.splice(0, this.buffer.length - this.MAX_BUFFER_SIZE)
    }

    this.notifyWaiters()
  }

  private notifyWaiters(): void {
    const waiters = this.waiters
    this.waiters = []
    for (const waiter of waiters) {
      waiter()
    }
  }

  private waitForData(timeoutMs: number): Promise<void> {
    return new Promise<void>((resolve) => {
      let settled = false

      const finish = (): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve()
      }

      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((waiter) => waiter !== finish)
        finish()
      }, timeoutMs)

      this.waiters.push(finish)
    })
  }

  private handleDisconnect(): void {
    if (this.port) {
      this.port.removeAllListeners()
      this.port = null
    }

    this.buffer = []
    this.notifyWaiters()

    if (this.onDisconnect) {
      this.onDisconnect()
      this.onDisconnect = undefined
    }
  }

  private isDisconnectError(err: Error): boolean {
    const msg = err.message.toLowerCase()
    return (
      msg.includes('disconnected') ||
      msg.includes('device has been lost') ||
      msg.includes('has been closed') ||
      msg.includes('no such device')
    )
  }

  async write(data: number[]): Promise<void> {
    const port = this.port
    if (!port?.isOpen) {
      throw new Error('Serial port not initialized')
    }

    await new Promise<void>((resolve, reject) => {
      port.write(new Uint8Array(data), (err) => {
        if (err) {
          console.error('Error writing serial port data:', err)
          if (this.isDisconnectError(err)) {
            this.handleDisconnect()
          }
          reject(err)
        } else {
          resolve()
        }
      })
    })
  }

  async read(minSize: number, timeoutMs: number = this.READ_TIMEOUT): Promise<number[]> {
    if (!this.port?.isOpen) {
      throw new Error('Serial port not initialized')
    }

    const target = Math.max(minSize, 0)
    const deadline = Date.now() + timeoutMs

    while (this.buffer.length < target) {
      const remaining = deadline - Date.now()
      if (remaining <= 0) {
        break
      }

      await this.waitForData(remaining)
    }

    return this.buffer.splice(0, Math.min(this.buffer.length, target))
  }

  async close(): Promise<void> {
    const port = this.port
    if (!port?.isOpen) {
      console.log('Serial port is already closed or not initialized')
      return
    }

    try {
      port.removeAllListeners()
      this.port = null
      this.buffer = []
      this.notifyWaiters()

      await new Promise<void>((resolve, reject) => {
        port.close((err) => {
          if (err) {
            console.error('close-serial-port error', err)
            reject(err)
          } else {
            console.log('Serial port closed successfully')
            resolve()
          }
        })
      })
    } catch (error) {
      console.error('close-serial-port error', error)
      throw error
    }
  }
}
