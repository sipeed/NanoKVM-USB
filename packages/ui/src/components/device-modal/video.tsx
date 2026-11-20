import { useEffect, useState } from 'react'
import { Select } from 'antd'
import { useAtom, useAtomValue } from 'jotai'
import { useTranslation } from 'react-i18next'

import { resolutionAtom, videoDeviceIdAtom, videoStateAtom } from '@/jotai/device.ts'
import { camera } from '@/libs/media/camera'
import * as storage from '@/libs/storage'
import type { MediaDevice } from '@/types'

type VideoProps = {
  setErrMsg: (msg: string) => void
}

export const Video = ({ setErrMsg }: VideoProps) => {
  const { t } = useTranslation()

  const resolution = useAtomValue(resolutionAtom)
  const [videoDeviceId, setVideoDeviceId] = useAtom(videoDeviceIdAtom)
  const [videoState, setVideoState] = useAtom(videoStateAtom)

  const [devices, setDevices] = useState<MediaDevice[]>([])

  useEffect(() => {
    getDevices(true)
  }, [])

  async function getDevices(autoOpen: boolean) {
    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices()
      const videoDevices = allDevices.filter((device) => device.kind === 'videoinput')
      const audioDevices = allDevices.filter((device) => device.kind === 'audioinput')

      const mediaDevices = videoDevices.map((videoDevice) => {
        const device: MediaDevice = {
          videoId: videoDevice.deviceId,
          videoName: videoDevice.label
        }

        if (videoDevice.groupId) {
          const matchedAudioDevice = audioDevices.find(
            (audioDevice) => audioDevice.groupId === videoDevice.groupId
          )
          if (matchedAudioDevice) {
            device.audioId = matchedAudioDevice.deviceId
            device.audioName = matchedAudioDevice.label
          }
        }

        return device
      })

      setDevices(mediaDevices)

      if (autoOpen && videoState !== 'connected') {
        const savedId = storage.getVideoDevice()
        if (!savedId) return

        const savedDevice = mediaDevices.find((device) => device.videoId === savedId)
        if (!savedDevice) return

        try {
          await openCamera(savedDevice.videoId, savedDevice.audioId)
        } catch (err) {
          console.log('failed to auto open camera: ', err)
        }
      }
    } catch (err) {
      console.log(err)
      setErrMsg(t('camera.failed'))
    }
  }

  async function selectDevice(videoId: string) {
    if (!videoId) {
      setVideoDeviceId('')
      return
    }

    if (videoState === 'connecting') return

    const device = devices.find((d) => d.videoId === videoId)
    if (!device) return

    setVideoState('connecting')
    setErrMsg('')

    try {
      await openCamera(device.videoId, device.audioId)
    } catch (err) {
      console.log(err)
      setVideoState('disconnected')
      setErrMsg(t('camera.failed'))
    }
  }

  async function openCamera(videoId: string, audioId?: string): Promise<void> {
    await camera.open(videoId, resolution.width, resolution.height, audioId)

    const video = document.getElementById('video') as HTMLVideoElement
    if (!video) return

    video.srcObject = camera.getStream()

    setVideoDeviceId(videoId)
    setVideoState('connected')
    storage.setVideoDevice(videoId)
  }

  return (
    <Select
      value={videoDeviceId || undefined}
      style={{ width: 280 }}
      options={devices}
      fieldNames={{
        value: 'videoId',
        label: 'videoName'
      }}
      allowClear={true}
      loading={videoState === 'connecting'}
      placeholder={t('modal.selectVideo')}
      onChange={selectDevice}
      onClick={() => getDevices(false)}
    />
  )
}
