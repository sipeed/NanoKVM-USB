import type { MediaKind, SerialPortInfo, UpdaterInfo } from '@nanokvm/core'

/**
 * 桌面端 preload 通过 `window.api` 暴露给渲染层的类型化契约。
 *
 * 主进程只做“原始字节串口传输 + 系统能力”，协议编解码由 `@nanokvm/core` 在渲染层完成。
 */
export interface DesktopApi {
  getAppVersion(): Promise<string>
  getPlatform(): Promise<string>
  openExternal(url: string): void
  checkMediaPermission(kind: MediaKind): Promise<boolean>
  requestMediaPermission(kind: MediaKind): Promise<boolean>
  serial: {
    list(): Promise<SerialPortInfo[]>
    open(options: { path: string; baudRate: number }): Promise<void>
    close(): Promise<void>
    read(minSize: number, timeoutMs?: number): Promise<number[]>
    write(data: number[]): Promise<void>
    onDisconnected(callback: () => void): () => void
  }
  updater: {
    check(): Promise<UpdaterInfo | null>
    download(): void
    onUpdateAvailable(cb: (info: UpdaterInfo) => void): () => void
    onUpdateNotAvailable(cb: () => void): () => void
    onProgress(cb: (percent: number) => void): () => void
    onDownloaded(cb: () => void): () => void
    onError(cb: () => void): () => void
  }
}
