import type { Device, PlatformAdapter } from '@nanokvm/core'

let platform: PlatformAdapter | null = null
let device: Device | null = null

/**
 * 由各端入口在渲染前注入平台能力与设备门面。
 */
export function initServices(appPlatform: PlatformAdapter, appDevice: Device): void {
  platform = appPlatform
  device = appDevice
}

export function getPlatform(): PlatformAdapter {
  if (!platform) {
    throw new Error('PlatformAdapter has not been initialized. Call initServices() first.')
  }
  return platform
}

export function getDevice(): Device {
  if (!device) {
    throw new Error('Device has not been initialized. Call initServices() first.')
  }
  return device
}
