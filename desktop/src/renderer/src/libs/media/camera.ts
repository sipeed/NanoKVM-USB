import { checkPermission } from '@renderer/libs/media/permission'

class Camera {
  id: string = ''
  width: number = 1920
  height: number = 1080
  audioId: string = ''
  stream: MediaStream | null = null

  public async open(id: string, width: number, height: number, audioId?: string): Promise<void> {
    if (!id && !this.id) {
      return
    }

    this.close()

    console.log('[Camera] Opening device - videoId:', id, 'audioId:', audioId)

    const video = {
      deviceId: { exact: id },
      width: { ideal: width },
      height: { ideal: height },
      frameRate: { ideal: 60 },
      latency: { ideal: 0 },
      resizeMode: 'none'
    }

    const isMicGranted = await checkPermission('microphone')
    const audio =
      isMicGranted && audioId
        ? {
            deviceId: { exact: audioId },
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            sampleRate: 48000,
            latency: 0
          }
        : false

    console.log('[Camera] Audio constraint:', audio)

    this.id = id
    this.width = width
    this.height = height
    if (audioId) this.audioId = audioId

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video, audio })
      
      // Log actually used devices
      this.stream.getTracks().forEach((track) => {
        console.log(`[Camera] ${track.kind} track:`, track.label)
      })
    } catch {
      this.stream = await navigator.mediaDevices.getUserMedia({ video, audio: false })
    }
  }

  public async updateResolution(width: number, height: number): Promise<void> {
    return this.open(this.id, width, height, this.audioId)
  }

  public close(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop())
      this.stream = null
    }
  }

  public getStream(): MediaStream | null {
    return this.stream
  }

  public isOpen(): boolean {
    return this.stream !== null
  }
}

export const camera = new Camera()
