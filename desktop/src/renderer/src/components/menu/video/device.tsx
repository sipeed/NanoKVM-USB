import { ReactElement, useEffect, useState } from 'react'
import { Popover } from 'antd'
import clsx from 'clsx'
import { useAtom, useAtomValue } from 'jotai'
import { VideoIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { resolutionAtom, videoDeviceIdAtom } from '@renderer/jotai/device'
import { camera } from '@renderer/libs/camera'
import * as storage from '@renderer/libs/storage'
import type { MediaDevice } from '@renderer/types'

export const Device = (): ReactElement => {
  const { t } = useTranslation()
  const resolution = useAtomValue(resolutionAtom)
  const [videoDeviceId, setVideoDeviceId] = useAtom(videoDeviceIdAtom)

  const [devices, setDevices] = useState<MediaDevice[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    getDevices()

    // デバイス変更を監視（BTヘッドホン着脱など）
    let debounceTimer: NodeJS.Timeout | null = null
    const handleDeviceChange = async () => {
      // 連続したイベントをデバウンス（500ms）
      if (debounceTimer) {
        clearTimeout(debounceTimer)
      }
      
      debounceTimer = setTimeout(async () => {
        console.log('[Device] Media device changed, checking audio track...')
      
        // 現在のストリームを確認
        const video = document.getElementById('video') as HTMLVideoElement
        if (!video?.srcObject) return

        const stream = video.srcObject as MediaStream
        const audioTrack = stream.getAudioTracks()[0]
      
        if (audioTrack) {
          // オーディオトラックの状態を確認
          console.log('[Device] Audio track:', audioTrack.label, 'state:', audioTrack.readyState)
        
          // トラックが終了していたら、デバイスリストを再取得してから再接続
          if (audioTrack.readyState === 'ended') {
            console.log('[Device] Audio track ended, refreshing device list and reopening...')
            await getDevices() // デバイスリストを最新化
            await reopenCurrentDevice()
          }
        }
      }, 500) // 500msのデバウンス
    }

    // デバイス変更を監視してaudio track状態をチェック
    // デバイスリストの更新はメニュー開閉時に行うため、ここでは不要
    const handleDeviceListChange = () => {
      handleDeviceChange()
    }

    navigator.mediaDevices.addEventListener('devicechange', handleDeviceListChange)

    return () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer)
      }
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceListChange)
    }
  }, [])

  async function getDevices(): Promise<void> {
    try {
      await navigator.mediaDevices.getUserMedia({ video: true })

      const allDevices = await navigator.mediaDevices.enumerateDevices()
      const videoDevices = allDevices.filter((device) => device.kind === 'videoinput')
      // 'default'や'communications'などの特殊なデバイスIDを除外
      const audioDevices = allDevices.filter(
        (device) => 
          device.kind === 'audioinput' && 
          !device.deviceId.startsWith('default') &&
          !device.deviceId.startsWith('communications')
      )

      console.log('[Device] Filtered audio devices:', audioDevices.map(d => ({
        label: d.label,
        deviceId: d.deviceId,
        groupId: d.groupId
      })))

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
    } catch (err) {
      console.log(err)
    }
  }

  async function reopenCurrentDevice(): Promise<void> {
    if (!videoDeviceId) return
    
    // 最新のデバイスリストから現在のvideoIdに対応するデバイスを探す
    await navigator.mediaDevices.getUserMedia({ video: true })
    const allDevices = await navigator.mediaDevices.enumerateDevices()
    const videoDevice = allDevices.find(d => d.kind === 'videoinput' && d.deviceId === videoDeviceId)
    
    if (!videoDevice) {
      console.log('[Device] Video device not found:', videoDeviceId)
      return
    }
    
    // 同じgroupIdのaudioデバイスを探す（defaultは除外）
    const audioDevice = allDevices.find(
      d => d.kind === 'audioinput' && 
           d.groupId === videoDevice.groupId && 
           !d.deviceId.startsWith('default') &&
           !d.deviceId.startsWith('communications')
    )
    
    if (audioDevice) {
      console.log('[Device] Reopening with audio:', audioDevice.label, 'id:', audioDevice.deviceId)
      await camera.open(videoDeviceId, resolution.width, resolution.height, audioDevice.deviceId)
    } else {
      console.log('[Device] Reopening without audio (no matching audio device found)')
      await camera.open(videoDeviceId, resolution.width, resolution.height)
    }
    
    const video = document.getElementById('video') as HTMLVideoElement
    if (video) {
      video.srcObject = camera.getStream()
    }
  }

  async function selectDevice(device: MediaDevice): Promise<void> {
    if (isLoading) return
    setIsLoading(true)

    try {
      await camera.open(device.videoId, resolution.width, resolution.height, device.audioId)

      const video = document.getElementById('video') as HTMLVideoElement
      if (!video) return
      video.srcObject = camera.getStream()

      // Start playback explicitly
      try {
        await video.play()
      } catch (err) {
        console.error('video.play() failed:', err)
      }

      setVideoDeviceId(device.videoId)
      storage.setVideoDevice(device.videoId)
    } finally {
      setIsLoading(false)
    }
  }

  const content = (
    <div className="max-h-[350px] overflow-y-auto">
      {devices.map((device) => (
        <div
          key={device.videoId}
          className={clsx(
            'cursor-pointer rounded px-2 py-1.5 hover:bg-neutral-700/60',
            device.videoId === videoDeviceId ? 'text-blue-500' : 'text-white'
          )}
          onClick={() => selectDevice(device)}
        >
          {device.videoName}
        </div>
      ))}
    </div>
  )

  return (
    <Popover content={content} placement="rightTop" arrow={false} align={{ offset: [13, 0] }}>
      <div className="flex h-[30px] cursor-pointer items-center space-x-2 rounded px-3 text-neutral-300 hover:bg-neutral-700/50">
        <VideoIcon size={16} />
        <span className="text-sm select-none">{t('video.device')}</span>
      </div>
    </Popover>
  )
}
