import { atom } from 'jotai'

import { Resolution } from '@renderer/types'

type VideoState = 'disconnected' | 'connecting' | 'connected'
type SerialState = 'notSupported' | 'disconnected' | 'connecting' | 'connected'
type BaudRate = 
  | "75"
  | "110" 
  | "134.5"
  | "150"
  | "300"
  | "600"
  | "1200"
  | "1800"
  | "2400"
  | "4800"
  | "7200"
  | "9600"
  | "14400"
  | "19200"
  | "28800"
  | "31250"
  | "38400"
  | "57600"
  | "74880"
  | "115200"
  | "230400"
  | "250000"
  | "460800"
  | "500000"
  | "921600"
  | "1000000"
  | "2000000"
  | "3000000"
  | "4000000"

export const resolutionAtom = atom<Resolution>({
  width: 1920,
  height: 1080
})

export const videoDeviceIdAtom = atom('')
export const videoStateAtom = atom<VideoState>('disconnected')

export const serialPortAtom = atom('')
export const serialPortStateAtom = atom<SerialState>('disconnected')
export const serialBaudRate = atom('57600')
