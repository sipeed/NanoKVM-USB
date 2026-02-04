import { IpcEvents } from '@common/ipc-events'
import type { Resolution } from '@renderer/types'

export async function checkPermission(device: 'camera' | 'microphone'): Promise<boolean> {
  try {
    const platform = await window.electron.ipcRenderer.invoke(IpcEvents.GET_PLATFORM)
    if (platform === 'darwin') {
      return await window.electron.ipcRenderer.invoke(IpcEvents.CHECK_MEDIA_PERMISSION, device)
    }

    const status = await navigator.permissions.query({
      name: device as PermissionName
    })
    return status.state === 'granted'
  } catch (error) {
    console.error(error)
    return false
  }
}

export async function requestCameraPermission(resolution?: Resolution): Promise<boolean> {
  try {
    const platform = await window.electron.ipcRenderer.invoke(IpcEvents.GET_PLATFORM)
    if (platform === 'darwin') {
      return await window.electron.ipcRenderer.invoke(IpcEvents.REQUEST_MEDIA_PERMISSION, 'camera')
    }

    const granted = await checkPermission('camera')
    if (granted) {
      return true
    }

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
  try {
    const platform = await window.electron.ipcRenderer.invoke(IpcEvents.GET_PLATFORM)
    if (platform === 'darwin') {
      return await window.electron.ipcRenderer.invoke(
        IpcEvents.REQUEST_MEDIA_PERMISSION,
        'microphone'
      )
    }

    const granted = await checkPermission('microphone')
    if (granted) {
      return true
    }

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
    return !(err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')
  }
}
