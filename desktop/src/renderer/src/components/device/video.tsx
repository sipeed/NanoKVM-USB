import { ReactElement, useEffect, useState } from 'react'
import { Select } from 'antd'
import { useAtom, useAtomValue } from 'jotai'
import { useTranslation } from 'react-i18next'

import { resolutionAtom, videoDeviceIdAtom, videoStateAtom } from '@renderer/jotai/device'
import { camera } from '@renderer/libs/media/camera'
import * as storage from '@renderer/libs/storage'
import type { MediaDevice } from '@renderer/types'

type VideoProps = {
  setMsg: (msg: string) => void
}

export const Video = ({ setMsg }: VideoProps): ReactElement => {
  const { t } = useTranslation()

  const resolution = useAtomValue(resolutionAtom)
  const [videoState, setVideoState] = useAtom(videoStateAtom)
  const [videoDeviceId, setVideoDeviceId] = useAtom(videoDeviceIdAtom)

  const [devices, setDevices] = useState<MediaDevice[]>([])

  useEffect(() => {
    getDevices(true)
  }, [])

  async function getDevices(autoOpen: boolean): Promise<void> {
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

      if (autoOpen) {
        const videoId = storage.getVideoDevice()
        if (!videoId) return
        const device = mediaDevices.find((d) => d.videoId === videoId)
        if (!device) return
        await openCamera(device.videoId, device.audioId)
      }
    } catch (err) {
      console.log(err)
      setMsg(t('camera.failed'))
    }
  }

  async function selectDevice(videoId: string): Promise<void> {
    if (!videoId) {
      setVideoDeviceId('')
      return
    }

    if (videoState === 'connecting') return
    setVideoState('connecting')
    setMsg('')

    const device = devices.find((d) => d.videoId === videoId)
    if (!device) {
      return
    }

    await openCamera(device.videoId, device.audioId)
  }

  async function openCamera(videoId: string, audioId?: string): Promise<void> {
    try {
      await camera.open(videoId, resolution.width, resolution.height, audioId)

      const video = document.getElementById('video') as HTMLVideoElement
      if (!video) return

      video.srcObject = camera.getStream()

      setVideoDeviceId(videoId)
      storage.setVideoDevice(videoId)

      setTimeout(() => {
        setVideoState('connected')
      }, 500)
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('camera.failed')
      setMsg(msg)
    }
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
