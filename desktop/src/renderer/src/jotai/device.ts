import { atom } from 'jotai'

import { Resolution } from '@renderer/types'

type VideoState = 'disconnected' | 'connecting' | 'connected'
type SerialState = 'notSupported' | 'disconnected' | 'connecting' | 'connected'
type MaxResolutionMode = '1440p30' | '1080p60'

export const resolutionAtom = atom<Resolution>({
  width: 1920,
  height: 1080
})

export const videoScaleAtom = atom<number>(0)

export const maxResolutionModeAtom = atom<MaxResolutionMode>('1440p30')

export const videoDeviceIdAtom = atom('')
export const videoStateAtom = atom<VideoState>('disconnected')

export const serialPortAtom = atom('')
export const serialPortStateAtom = atom<SerialState>('disconnected')
export const baudRateAtom = atom(57600)
