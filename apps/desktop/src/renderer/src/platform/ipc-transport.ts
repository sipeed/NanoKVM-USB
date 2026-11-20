import type { OpenSerialPortOptions, SerialPortInfo, SerialTransport } from '@nanokvm/core'

/**
 * 桌面端传输层：通过 preload 暴露的 IPC 契约调用主进程的 node-serialport，
 * 渲染层只收发原始字节。
 */
export class IpcSerialTransport implements SerialTransport {
  readonly kind = 'ipc' as const

  isSupported(): boolean {
    return true
  }

  supportsEnumeration(): boolean {
    return true
  }

  async list(): Promise<SerialPortInfo[]> {
    return window.api.serial.list()
  }

  async request(): Promise<void> {
    // 桌面端不需要用户手势授权
  }

  async open(options: OpenSerialPortOptions): Promise<void> {
    if (!options.path) {
      throw new Error('Serial port path is required on desktop')
    }

    await window.api.serial.open({ path: options.path, baudRate: options.baudRate })
  }

  async close(): Promise<void> {
    await window.api.serial.close()
  }

  async read(minSize: number, timeoutMs?: number): Promise<number[]> {
    return window.api.serial.read(minSize, timeoutMs)
  }

  async write(data: number[]): Promise<void> {
    await window.api.serial.write(data)
  }

  onDisconnect(callback: () => void): () => void {
    return window.api.serial.onDisconnected(callback)
  }
}
