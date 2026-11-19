import type { Resolution } from '@/types.ts'

import { getPlatform } from '../../services'

export async function checkPermission(device: 'camera' | 'microphone'): Promise<boolean> {
  try {
    return await getPlatform().checkMediaPermission(device)
  } catch (error) {
    console.error(error)
    return false
  }
}

export async function requestCameraPermission(resolution?: Resolution): Promise<boolean> {
  const platform = getPlatform()

  try {
    const granted = await platform.requestMediaPermission('camera')
    if (granted) return true

    // 某些平台（浏览器 / 非 macOS 桌面）需要真正打开一次设备才能完成授权
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: resolution?.width || 1920 },
        height: { ideal: resolution?.height || 1080 },
        frameRate: { ideal: 60 }
      }
    })
    stream.getTracks().forEach((track) => track.stop())
    return true
  } catch (err: any) {
    return !(err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')
  }
}

export async function requestMicrophonePermission(): Promise<boolean> {
  const platform = getPlatform()

  try {
    const granted = await platform.requestMediaPermission('microphone')
    if (granted) return true

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        sampleRate: 48000
      }
    })
    stream.getTracks().forEach((track) => track.stop())
    return true
  } catch (err: any) {
    console.log('failed to request media permissions: ', err)
    return !(err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')
  }
}
