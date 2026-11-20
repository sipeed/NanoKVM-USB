import type { Resolution, Rotation } from '@/types'

const LANGUAGE_KEY = 'nanokvm-usb-language'
const VIDEO_DEVICE_ID_KEY = 'nanokvm-usb-video-device-id'
const VIDEO_RESOLUTION_KEY = 'nanokvm-usb-video-resolution'
const CUSTOM_RESOLUTION_KEY = 'nanokvm-usb-custom-resolution'
const VIDEO_SCALE_KEY = 'nanokvm-usb-video-scale'
const VIDEO_ROTATION_KEY = 'nanokvm-usb-video-rotation'
const SERIAL_PORT_KEY = 'nanokvm-serial-port'
const IS_MENU_OPEN_KEY = 'nanokvm-is-menu-open'
const MOUSE_STYLE_KEY = 'nanokvm-usb-mouse-style'
const MOUSE_MODE_KEY = 'nanokvm-usb-mouse-mode'
const MOUSE_SCROLL_DIRECTION_KEY = 'nanokvm-usb-mouse-scroll-direction'
const MOUSE_SCROLL_INTERVAL_KEY = 'nanokvm-usb-mouse-scroll-interval'
const MOUSE_JIGGLER_MODE_KEY = 'nanokvm-usb-mouse-jiggler-mode'
const BAUD_RATE_KEY = 'nanokvm-usb-baud-rate'
const AUTO_RECONNECT_KEY = 'nanokvm-usb-auto-reconnect'
const SKIP_UPDATE_KEY = 'nano-kvm-check-update'

/**
 * 桌面端历史 key 为复数形式，浏览器端为单数。读取时两者兼容，写入统一用单数。
 */
const KEYBOARD_SHORTCUT_KEY = 'nanokvm-usb-keyboard-shortcut'
const LEGACY_KEYBOARD_SHORTCUT_KEY = 'nanokvm-usb-keyboard-shortcuts'

type ItemWithExpiry = {
  value: string
  expiry: number
}

export function getLanguage(): string | null {
  return localStorage.getItem(LANGUAGE_KEY)
}

export function setLanguage(language: string): void {
  localStorage.setItem(LANGUAGE_KEY, language)
}

export function getVideoDevice(): string | null {
  return localStorage.getItem(VIDEO_DEVICE_ID_KEY)
}

export function setVideoDevice(id: string): void {
  localStorage.setItem(VIDEO_DEVICE_ID_KEY, id)
}

export function getVideoResolution(): Resolution | undefined {
  const resolution = localStorage.getItem(VIDEO_RESOLUTION_KEY)
  if (!resolution) return
  return window.JSON.parse(resolution) as Resolution
}

export function setVideoResolution(width: number, height: number): void {
  localStorage.setItem(VIDEO_RESOLUTION_KEY, window.JSON.stringify({ width, height }))
}

export function getCustomResolutions(): Resolution[] | undefined {
  const resolution = localStorage.getItem(CUSTOM_RESOLUTION_KEY)
  if (!resolution) return
  return window.JSON.parse(resolution) as Resolution[]
}

export function setCustomResolution(width: number, height: number): void {
  const resolutions = getCustomResolutions()

  if (resolutions?.some((r) => r.width === width && r.height === height)) {
    return
  }

  const data = resolutions ? [...resolutions, { width, height }] : [{ width, height }]
  localStorage.setItem(CUSTOM_RESOLUTION_KEY, window.JSON.stringify(data))
}

export function removeCustomResolutions(): void {
  localStorage.removeItem(CUSTOM_RESOLUTION_KEY)
}

export function getVideoScale(): number | null {
  const scale = localStorage.getItem(VIDEO_SCALE_KEY)
  if (scale && Number(scale)) {
    return Number(scale)
  }
  return null
}

export function setVideoScale(scale: number): void {
  localStorage.setItem(VIDEO_SCALE_KEY, String(scale))
}

export function getVideoRotation(): Rotation | null {
  const rotation = localStorage.getItem(VIDEO_ROTATION_KEY)
  if (rotation) {
    const value = Number(rotation)
    if (value === 0 || value === 90 || value === 180 || value === 270) {
      return value as Rotation
    }
  }
  return null
}

export function setVideoRotation(rotation: Rotation): void {
  localStorage.setItem(VIDEO_ROTATION_KEY, String(rotation))
}

export function getSerialPort(): string | null {
  return localStorage.getItem(SERIAL_PORT_KEY)
}

export function setSerialPort(port: string): void {
  localStorage.setItem(SERIAL_PORT_KEY, port)
}

export function getBaudRate(): number {
  const baudRate = localStorage.getItem(BAUD_RATE_KEY)
  if (!baudRate) return 57600
  return parseInt(baudRate, 10)
}

export function setBaudRate(baudRate: number): void {
  localStorage.setItem(BAUD_RATE_KEY, baudRate.toString())
}

export function getAutoReconnect(): boolean {
  const value = localStorage.getItem(AUTO_RECONNECT_KEY)
  if (value === null) return true
  return value === 'true'
}

export function setAutoReconnect(enabled: boolean): void {
  localStorage.setItem(AUTO_RECONNECT_KEY, enabled ? 'true' : 'false')
}

export function getIsMenuOpen(): boolean {
  const state = localStorage.getItem(IS_MENU_OPEN_KEY)
  if (!state) return true
  return state === 'true'
}

export function setIsMenuOpen(isOpen: boolean): void {
  localStorage.setItem(IS_MENU_OPEN_KEY, isOpen ? 'true' : 'false')
}

export function getMouseStyle(): string | null {
  return localStorage.getItem(MOUSE_STYLE_KEY)
}

export function setMouseStyle(mouse: string): void {
  localStorage.setItem(MOUSE_STYLE_KEY, mouse)
}

export function getMouseMode(): string | null {
  return localStorage.getItem(MOUSE_MODE_KEY)
}

export function setMouseMode(mouse: string): void {
  localStorage.setItem(MOUSE_MODE_KEY, mouse)
}

export function getMouseScrollDirection(): number | null {
  const direction = localStorage.getItem(MOUSE_SCROLL_DIRECTION_KEY)
  if (direction && Number(direction)) {
    return Number(direction)
  }
  return null
}

export function setMouseScrollDirection(direction: number): void {
  localStorage.setItem(MOUSE_SCROLL_DIRECTION_KEY, String(direction))
}

export function getMouseScrollInterval(): number | null {
  const interval = localStorage.getItem(MOUSE_SCROLL_INTERVAL_KEY)
  if (interval && Number(interval)) {
    return Number(interval)
  }
  return null
}

export function setMouseScrollInterval(interval: number): void {
  localStorage.setItem(MOUSE_SCROLL_INTERVAL_KEY, String(interval))
}

export function getMouseJigglerMode(): 'enable' | 'disable' {
  const jiggler = localStorage.getItem(MOUSE_JIGGLER_MODE_KEY)
  return jiggler && jiggler === 'enable' ? 'enable' : 'disable'
}

export function setMouseJigglerMode(jiggler: 'enable' | 'disable'): void {
  localStorage.setItem(MOUSE_JIGGLER_MODE_KEY, jiggler)
}

export function getShortcuts(): string | null {
  return (
    localStorage.getItem(KEYBOARD_SHORTCUT_KEY) ??
    localStorage.getItem(LEGACY_KEYBOARD_SHORTCUT_KEY)
  )
}

export function setShortcuts(shortcuts: string): void {
  localStorage.setItem(KEYBOARD_SHORTCUT_KEY, shortcuts)
}

export function getSkipUpdate(): boolean {
  const skip = getWithExpiry(SKIP_UPDATE_KEY)
  return skip ? Boolean(skip) : false
}

export function setSkipUpdate(skip: boolean): void {
  const expiry = 3 * 24 * 60 * 60 * 1000
  setWithExpiry(SKIP_UPDATE_KEY, String(skip), expiry)
}

export function clearAllSettings(): void {
  localStorage.removeItem(LANGUAGE_KEY)
  localStorage.removeItem(VIDEO_DEVICE_ID_KEY)
  localStorage.removeItem(VIDEO_RESOLUTION_KEY)
  localStorage.removeItem(CUSTOM_RESOLUTION_KEY)
  localStorage.removeItem(VIDEO_SCALE_KEY)
  localStorage.removeItem(VIDEO_ROTATION_KEY)
  localStorage.removeItem(SERIAL_PORT_KEY)
  localStorage.removeItem(IS_MENU_OPEN_KEY)
  localStorage.removeItem(MOUSE_STYLE_KEY)
  localStorage.removeItem(MOUSE_MODE_KEY)
  localStorage.removeItem(MOUSE_SCROLL_DIRECTION_KEY)
  localStorage.removeItem(MOUSE_SCROLL_INTERVAL_KEY)
  localStorage.removeItem(MOUSE_JIGGLER_MODE_KEY)
  localStorage.removeItem(BAUD_RATE_KEY)
  localStorage.removeItem(AUTO_RECONNECT_KEY)
  localStorage.removeItem(SKIP_UPDATE_KEY)
  localStorage.removeItem(KEYBOARD_SHORTCUT_KEY)
  localStorage.removeItem(LEGACY_KEYBOARD_SHORTCUT_KEY)
}

// 带过期时间的存储（用于“跳过本次更新”等短期标记）
export function setWithExpiry(key: string, value: string, ttl: number): void {
  const item: ItemWithExpiry = { value, expiry: Date.now() + ttl }
  localStorage.setItem(key, JSON.stringify(item))
}

export function getWithExpiry(key: string): string | null {
  const itemStr = localStorage.getItem(key)
  if (!itemStr) return null

  try {
    const item = JSON.parse(itemStr) as ItemWithExpiry
    if (Date.now() > item.expiry) {
      localStorage.removeItem(key)
      return null
    }
    return item.value
  } catch {
    return null
  }
}
