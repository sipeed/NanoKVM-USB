import type { Resolution, Rotation } from '@/types';

const LANGUAGE_KEY = 'nanokvm-usb-language';
const VIDEO_DEVICE_ID_KEY = 'nanokvm-usb-video-device-id';
const VIDEO_RESOLUTION_KEY = 'nanokvm-usb-video-resolution';
const CUSTOM_RESOLUTION_KEY = 'nanokvm-usb-custom-resolution';
const VIDEO_SCALE_KEY = 'nanokvm-usb-video-scale';
const VIDEO_ROTATION_KEY = 'nanokvm-usb-video-rotation';
const IS_MENU_OPEN_KEY = 'nanokvm-is-menu-open';
const MOUSE_STYLE_KEY = 'nanokvm-usb-mouse-style';
const MOUSE_MODE_KEY = 'nanokvm-usb-mouse-mode';
const MOUSE_SCROLL_DIRECTION_KEY = 'nanokvm-usb-mouse-scroll-direction';
const MOUSE_SCROLL_INTERVAL_KEY = 'nanokvm-usb-mouse-scroll-interval';
const MOUSE_JIGGLER_MODE_KEY = 'nanokvm-usb-mouse-jiggler-mode';
const KEYBOARD_SHORTCUT_KEY = 'nanokvm-usb-keyboard-shortcut';

export function getLanguage() {
  return localStorage.getItem(LANGUAGE_KEY);
}

export function setLanguage(language: string) {
  localStorage.setItem(LANGUAGE_KEY, language);
}

export function setVideoDevice(id: string) {
  localStorage.setItem(VIDEO_DEVICE_ID_KEY, id);
}

export function getVideoDevice() {
  return localStorage.getItem(VIDEO_DEVICE_ID_KEY);
}

export function setVideoResolution(width: number, height: number) {
  localStorage.setItem(VIDEO_RESOLUTION_KEY, window.JSON.stringify({ width, height }));
}

export function getVideoResolution() {
  const resolution = localStorage.getItem(VIDEO_RESOLUTION_KEY);
  if (!resolution) return;
  return window.JSON.parse(resolution) as Resolution;
}

export function getCustomResolutions() {
  const resolution = localStorage.getItem(CUSTOM_RESOLUTION_KEY);
  if (!resolution) return;
  return window.JSON.parse(resolution) as Resolution[];
}

export function setCustomResolution(width: number, height: number) {
  const resolutions = getCustomResolutions();
  if (resolutions?.some((r) => r.width === width && r.height === height)) {
    return;
  }

  const data = resolutions ? [...resolutions, { width, height }] : [{ width, height }];
  localStorage.setItem(CUSTOM_RESOLUTION_KEY, window.JSON.stringify(data));
}

export function removeCustomResolutions() {
  localStorage.removeItem(CUSTOM_RESOLUTION_KEY);
}

export function getVideoScale(): number | null {
  const scale = localStorage.getItem(VIDEO_SCALE_KEY);
  if (scale && Number(scale)) {
    return Number(scale);
  }
  return null;
}

export function setVideoScale(scale: number): void {
  localStorage.setItem(VIDEO_SCALE_KEY, String(scale));
}

export function getVideoRotation(): Rotation | null {
  const rotation = localStorage.getItem(VIDEO_ROTATION_KEY);
  if (rotation) {
    const value = Number(rotation);
    if (value === 0 || value === 90 || value === 180 || value === 270) {
      return value as Rotation;
    }
  }
  return null;
}

export function setVideoRotation(rotation: Rotation): void {
  localStorage.setItem(VIDEO_ROTATION_KEY, String(rotation));
}

export function getIsMenuOpen(): boolean {
  const state = localStorage.getItem(IS_MENU_OPEN_KEY);
  if (!state) {
    return true;
  }
  return state === 'true';
}

export function setIsMenuOpen(isOpen: boolean) {
  localStorage.setItem(IS_MENU_OPEN_KEY, isOpen ? 'true' : 'false');
}

export function getMouseStyle() {
  return localStorage.getItem(MOUSE_STYLE_KEY);
}

export function setMouseStyle(mouse: string) {
  localStorage.setItem(MOUSE_STYLE_KEY, mouse);
}

export function getMouseMode() {
  return localStorage.getItem(MOUSE_MODE_KEY);
}

export function setMouseMode(mouse: string) {
  localStorage.setItem(MOUSE_MODE_KEY, mouse);
}

export function getMouseScrollDirection(): number | null {
  const direction = localStorage.getItem(MOUSE_SCROLL_DIRECTION_KEY);
  if (direction && Number(direction)) {
    return Number(direction);
  }
  return null;
}

export function setMouseScrollDirection(direction: number): void {
  localStorage.setItem(MOUSE_SCROLL_DIRECTION_KEY, String(direction));
}

export function getMouseScrollInterval(): number | null {
  const interval = localStorage.getItem(MOUSE_SCROLL_INTERVAL_KEY);
  if (interval && Number(interval)) {
    return Number(interval);
  }
  return null;
}

export function setMouseScrollInterval(interval: number): void {
  localStorage.setItem(MOUSE_SCROLL_INTERVAL_KEY, String(interval));
}

export function getShortcuts(): string | null {
  return localStorage.getItem(KEYBOARD_SHORTCUT_KEY);
}

export function setShortcuts(shortcuts: string): void {
  localStorage.setItem(KEYBOARD_SHORTCUT_KEY, shortcuts);
}

export function getMouseJigglerMode(): 'enable' | 'disable' {
  const jiggler = localStorage.getItem(MOUSE_JIGGLER_MODE_KEY);
  return jiggler && jiggler === 'enable' ? 'enable' : 'disable';
}

export function setMouseJigglerMode(jiggler: 'enable' | 'disable'): void {
  localStorage.setItem(MOUSE_JIGGLER_MODE_KEY, jiggler);
}
