import { atom } from 'jotai'

import { Resolution } from '@renderer/types'

type VideoState = 'disconnected' | 'connecting' | 'connected'
type SerialState = 'notSupported' | 'disconnected' | 'connecting' | 'connected'

export const resolutionAtom = atom<Resolution>({
  width: 1920,
  height: 1080
})

export const videoScaleAtom = atom<number>(1.0)

// Experimental: capture the device uncompressed (YUY2) via FFmpeg instead of
// getUserMedia (which forces MJPEG). macOS only for now.
export const captureModeAtom = atom<boolean>(false)
export const captureDeviceAtom = atom<string>('')
export const sharpnessAtom = atom<number>(0.5)

export const videoDeviceIdAtom = atom('')
export const videoStateAtom = atom<VideoState>('disconnected')

export const serialPortAtom = atom('')
export const serialPortStateAtom = atom<SerialState>('disconnected')
export const baudRateAtom = atom(57600)
