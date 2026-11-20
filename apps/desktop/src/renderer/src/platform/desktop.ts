import type { MediaKind, PlatformAdapter, UpdaterAdapter } from '@nanokvm/core'

import { IpcSerialTransport } from './ipc-transport'

export class DesktopPlatform implements PlatformAdapter {
  readonly transport = new IpcSerialTransport()

  readonly updater: UpdaterAdapter = {
    check: () => window.api.updater.check(),
    download: () => window.api.updater.download(),
    onUpdateAvailable: (callback) => window.api.updater.onUpdateAvailable(callback),
    onUpdateNotAvailable: (callback) => window.api.updater.onUpdateNotAvailable(callback),
    onProgress: (callback) => window.api.updater.onProgress(callback),
    onDownloaded: (callback) => window.api.updater.onDownloaded(callback),
    onError: (callback) => window.api.updater.onError(callback)
  }

  openExternal(url: string): void {
    window.api.openExternal(url)
  }

  async getVersion(): Promise<string> {
    return window.api.getAppVersion()
  }

  async checkMediaPermission(kind: MediaKind): Promise<boolean> {
    const platform = await window.api.getPlatform()
    if (platform === 'darwin') {
      return window.api.checkMediaPermission(kind)
    }

    try {
      const status = await navigator.permissions.query({ name: kind as PermissionName })
      return status.state === 'granted'
    } catch {
      return false
    }
  }

  async requestMediaPermission(kind: MediaKind): Promise<boolean> {
    const platform = await window.api.getPlatform()
    if (platform === 'darwin') {
      return window.api.requestMediaPermission(kind)
    }

    return this.checkMediaPermission(kind)
  }
}
