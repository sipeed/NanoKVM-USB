import { SerialPort as SP } from 'serialport'

type Options = {
  path: string
  baudRate?: number
  onDisconnect?: () => void
}

export class SerialPort {
  readonly SERIAL_BAUD_RATE = 57600
  readonly READ_TIMEOUT = 500

  private port: SP | null
  private onDisconnect?: () => void

  constructor() {
    this.port = null
  }

  async init(options: Options): Promise<void> {
    try {
      // Always clean up existing port (even if not isOpen, it may hold OS-level lock)
      if (this.port) {
        try {
          this.port.removeAllListeners()
          if (this.port.isOpen) {
            await new Promise<void>((resolve, reject) => {
              this.port!.close((err) => {
                if (err) reject(err)
                else resolve()
              })
            })
          } else {
            // Force destroy to release file descriptor even if not fully open
            this.port.destroy()
          }
        } catch (e) {
          console.warn('Error cleaning up previous port:', e)
        }
        this.port = null
        await new Promise((resolve) => setTimeout(resolve, 200))
      }

      const path = options.path
      const baudRate = options.baudRate || this.SERIAL_BAUD_RATE

      const port = await new Promise<SP>((resolve, reject) => {
        const sp = new SP({ path, baudRate }, (err) => {
          if (err) {
            console.error('Error opening port: ', err.message)
            // Destroy to release any partially-acquired file descriptor
            sp.destroy()
            reject(err)
          } else {
            resolve(sp)
          }
        })
      })

      this.port = port

      if (options.onDisconnect) {
        this.onDisconnect = options.onDisconnect
      }

      this.port.on('close', () => {
        console.warn('Serial port closed event received')
        this.handleDisconnect()
      })

      this.port.on('error', (err) => {
        console.error('Serial port error:', err)
        if (this.isDisconnectError(err)) {
          this.handleDisconnect()
        }
      })

      this.port.on('data', () => {})
    } catch (err) {
      console.error('Error opening serial port:', err)
      throw err
    }
  }

  private handleDisconnect(): void {
    if (this.port) {
      this.port.removeAllListeners()
      this.port = null
    }

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
    if (!this.port?.isOpen) {
      return
    }

    const uint8Array = new Uint8Array(data)
    this.port.write(uint8Array)
  }

  async read(minSize: number, sleep: number = 0): Promise<number[]> {
    if (!this.port?.isOpen) {
      throw new Error('Serial port not initialized')
    }

    const result: number[] = []
    const startTime = Date.now()

    while (result.length < minSize) {
      if (Date.now() - startTime > this.READ_TIMEOUT) {
        return []
      }

      const { value, done } = await this.port.read()
      if (done) {
        break
      }

      const data = Array.from(value) as number[]
      result.push(...data)
    }

    if (sleep > 0) {
      await new Promise((resolve) => setTimeout(resolve, sleep))
    }

    return result
  }

  async close(): Promise<void> {
    if (this.port?.isOpen) {
      try {
        this.port.removeAllListeners()

        await new Promise<void>((resolve, reject) => {
          this.port!.close((err) => {
            if (err) {
              console.error('close-serial-port error', err)
              reject(err)
            } else {
              console.log('Serial port closed successfully')
              resolve()
            }
          })
        })

        this.port = null
      } catch (error) {
        console.error('close-serial-port error', error)
        throw error
      }
    } else {
      console.log('Serial port is already closed or not initialized')
    }
  }
}
