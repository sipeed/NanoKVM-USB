export type Resolution = {
  width: number
  height: number
}

export type Rotation = 0 | 90 | 180 | 270

export type MediaDevice = {
  videoId: string
  videoName: string
  audioId?: string
  audioName?: string
}

export type VideoState = 'disconnected' | 'connecting' | 'connected'
export type SerialState = 'notSupported' | 'disconnected' | 'connecting' | 'connected'
