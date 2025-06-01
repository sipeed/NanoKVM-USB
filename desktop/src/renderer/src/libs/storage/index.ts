import type { Resolution } from '@renderer/types'

import { getWithExpiry, setWithExpiry } from './expiry'

const LANGUAGE_KEY = 'nanokvm-usb-language'
const VIDEO_DEVICE_ID_KEY = 'nanokvm-usb-video-device-id'
const VIDEO_RESOLUTION_KEY = 'nanokvm-usb-video-resolution'
const CUSTOM_RESOLUTION_KEY = 'nanokvm-usb-custom-resolution'
const SERIAL_PORT_KEY = 'nanokvm-serial-port'
const IS_MENU_OPEN_KEY = 'nanokvm-is-menu-open'
const MOUSE_STYLE_KEY = 'nanokvm-usb-mouse-style'
const MOUSE_MODE_KEY = 'nanokvm-usb-mouse-mode'
const MOUSE_SCROLL_DIRECTION_KEY = 'nanokvm-usb-mouse-scroll-direction'
const SKIP_UPDATE_KEY = 'nano-kvm-check-update'
const MOUSE_SCROLL_INTERVAL_KEY = 'nanokvm-usb-mouse-scroll-interval'
const MOUSE_JIGGLER_MODE_KEY = 'nanokvm-usb-mouse-jiggler-mode'

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
  if (!resolution) {
    return
  }
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

export function getSerialPort(): string | null {
  return localStorage.getItem(SERIAL_PORT_KEY)
}

export function setSerialPort(port: string): void {
  localStorage.setItem(SERIAL_PORT_KEY, port)
}

export function getIsMenuOpen(): boolean {
  const state = localStorage.getItem(IS_MENU_OPEN_KEY)
  if (!state) {
    return true
  }
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

export function getSkipUpdate(): boolean {
  const skip = getWithExpiry(SKIP_UPDATE_KEY)
  return skip ? Boolean(skip) : false
}

export function setSkipUpdate(skip: boolean): void {
  const expiry = 3 * 24 * 60 * 60 * 1000
  setWithExpiry(SKIP_UPDATE_KEY, String(skip), expiry)
}

export function getMouseJigglerMode(): 'enable' | 'disable' {
  const jiggler = localStorage.getItem(MOUSE_JIGGLER_MODE_KEY)
  return jiggler && jiggler === 'enable' ? 'enable' : 'disable'
}

export function setMouseJigglerMode(jiggler: 'enable' | 'disable'): void {
  localStorage.setItem(MOUSE_JIGGLER_MODE_KEY, jiggler)
}
