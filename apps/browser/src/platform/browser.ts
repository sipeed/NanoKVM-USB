import type { MediaKind, PlatformAdapter } from '@nanokvm/core'

import { WebSerialTransport } from './web-serial'

export class BrowserPlatform implements PlatformAdapter {
  readonly transport = new WebSerialTransport()

  openExternal(url: string): void {
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  async getVersion(): Promise<string> {
    return __APP_VERSION__
  }

  async checkMediaPermission(kind: MediaKind): Promise<boolean> {
    try {
      const status = await navigator.permissions.query({ name: kind as PermissionName })
      return status.state === 'granted'
    } catch {
      return false
    }
  }

  async requestMediaPermission(kind: MediaKind): Promise<boolean> {
    return this.checkMediaPermission(kind)
  }
}
