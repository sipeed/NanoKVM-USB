import { SerialPort as SP } from 'serialport'

export class SerialPort {
  port: SP | null
  readonly TIMEOUT = 500 // 500ms

  constructor() {
    this.port = null
  }

  async init(
    path: string,
    baudRate: number = 57600,
    onOpen: (err: Error | null) => void
  ): Promise<void> {
    try {
      if (this.port?.isOpen) {
        console.log('Closing existing serial port before opening new one')
        await this.close()
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      console.log(`Opening serial port: ${path} at ${baudRate} baud`)
      this.port = new SP({ path, baudRate }, (err) => {
        if (err) {
          console.error('Error opening port: ', err.message)
        } else {
          console.log(`Serial port ${path} opened successfully at ${baudRate} baud`)
        }
        onOpen(err)
      })
    } catch (err) {
      console.error('Error opening serial port:', err)
      throw err
    }
  }

  async write(data: number[]): Promise<void> {
    if (!this.port?.isOpen) {
      // throw new Error('Serial port not initialized')
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
      if (Date.now() - startTime > this.TIMEOUT) {
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
        console.log('Closing serial port...')
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
      } catch (error) {
        console.error('close-serial-port error', error)
        throw error
      }
    } else {
      console.log('Serial port is already closed or not initialized')
    }
  }
}
