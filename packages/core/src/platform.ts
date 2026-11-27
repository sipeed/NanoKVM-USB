import type { SerialTransport } from './device/transport'

export type MediaKind = 'camera' | 'microphone'

export interface UpdaterInfo {
  version?: string
}

/** 桌面端自动更新能力；浏览器端不提供（`platform.updater` 为 undefined） */
export interface UpdaterAdapter {
  check(): Promise<UpdaterInfo | null>
  download(): void
  onUpdateAvailable(callback: (info: UpdaterInfo) => void): () => void
  onUpdateNotAvailable(callback: () => void): () => void
  onProgress(callback: (percent: number) => void): () => void
  onDownloaded(callback: () => void): () => void
  onError(callback: () => void): () => void
}

/**
 * 平台适配器：宿主（Electron / 浏览器）向共享渲染层暴露的全部能力。
 *
 * 共享 UI 只允许通过本接口判断平台能力，禁止直接检测 `window.electron`。
 */
export interface PlatformAdapter {
  readonly transport: SerialTransport

  /** 打开外部链接（桌面端走系统浏览器） */
  openExternal(url: string): void

  /** 应用版本号 */
  getVersion(): Promise<string>

  /** 查询摄像头/麦克风权限（macOS 桌面端走主进程原生 API） */
  checkMediaPermission(kind: MediaKind): Promise<boolean>

  /** 请求摄像头/麦克风权限 */
  requestMediaPermission(kind: MediaKind): Promise<boolean>

  /** 桌面端自动更新；浏览器端不提供 */
  readonly updater?: UpdaterAdapter
}
