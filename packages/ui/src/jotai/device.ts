import { atom } from 'jotai'

import * as storage from '@/libs/storage'
import type { Resolution, Rotation, SerialState, VideoState } from '@/types.ts'

export const resolutionAtom = atom<Resolution>({
  width: 1920,
  height: 1080
})

export const videoScaleAtom = atom<number>(1.0)

export const videoRotationAtom = atom<Rotation>(storage.getVideoRotation() ?? 0)

export const videoDeviceIdAtom = atom('')
export const videoStateAtom = atom<VideoState>('disconnected')

// 手动选择框的初值必须为空：保存的端口只用于自动重连。
// 若初值直接填保存端口，用户重新插拔后再选同一个端口不会触发 onChange。
export const serialPortAtom = atom('')
export const serialStateAtom = atom<SerialState>('disconnected')
export const baudRateAtom = atom<number>(storage.getBaudRate())
export const autoReconnectAtom = atom<boolean>(storage.getAutoReconnect())
export const deviceModalOpenAtom = atom<boolean>(true)
