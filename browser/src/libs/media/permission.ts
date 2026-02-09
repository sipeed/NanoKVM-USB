import { Resolution } from '@/types.ts';

export async function checkPermission(device: 'camera' | 'microphone'): Promise<boolean> {
  try {
    const status = await navigator.permissions.query({
      name: device as PermissionName
    });

    return status.state === 'granted';
  } catch (error) {
    console.error(error);
    return false;
  }
}

export async function requestCameraPermission(resolution?: Resolution) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: resolution?.width || 1920 },
        height: { ideal: resolution?.height || 1080 },
        frameRate: { ideal: 60 }
      }
    });
    stream.getTracks().forEach((track) => track.stop());
    return true;
  } catch (err: any) {
    return !(err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError');
  }
}

export async function requestMicrophonePermission() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        sampleRate: 48000
      }
    });
    stream.getTracks().forEach((track) => track.stop());
    return true;
  } catch (err: any) {
    console.log('failed to request media permissions: ', err);
    return !(err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError');
  }
}
