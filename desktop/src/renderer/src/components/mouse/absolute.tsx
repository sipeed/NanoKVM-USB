import { ReactElement, useEffect, useRef } from 'react'
import { useAtomValue } from 'jotai'

import { IpcEvents } from '@common/ipc-events'
import { resolutionAtom } from '@renderer/jotai/device'
import { scrollDirectionAtom, scrollIntervalAtom } from '@renderer/jotai/mouse'
import { Key } from '@renderer/libs/mouse'
import { mouseJiggler } from '@renderer/libs/mouse-jiggler'

export const Absolute = (): ReactElement => {
  const resolution = useAtomValue(resolutionAtom)
  const scrollDirection = useAtomValue(scrollDirectionAtom)
  const scrollInterval = useAtomValue(scrollIntervalAtom)

  const keyRef = useRef<Key>(new Key())
  const lastScrollTimeRef = useRef(0)

  useEffect(() => {
    const canvas = document.getElementById('video')
    if (!canvas) return

    canvas.addEventListener('mousedown', handleMouseDown)
    canvas.addEventListener('mouseup', handleMouseUp)
    canvas.addEventListener('mousemove', handleMouseMove)
    canvas.addEventListener('wheel', handleWheel)
    canvas.addEventListener('click', disableEvent)
    canvas.addEventListener('contextmenu', disableEvent)

    // press button
    async function handleMouseDown(event: MouseEvent): Promise<void> {
      disableEvent(event)

      switch (event.button) {
        case 0:
          keyRef.current.left = true
          break
        case 1:
          keyRef.current.mid = true
          break
        case 2:
          keyRef.current.right = true
          break
        default:
          console.log(`unknown button ${event.button}`)
          return
      }

      await send(event)
    }

    // release button
    async function handleMouseUp(event: MouseEvent): Promise<void> {
      disableEvent(event)

      switch (event.button) {
        case 0:
          keyRef.current.left = false
          break
        case 1:
          keyRef.current.mid = false
          break
        case 2:
          keyRef.current.right = false
          break
        default:
          console.log(`unknown button ${event.button}`)
          return
      }

      await send(event)
    }

    // mouse move
    async function handleMouseMove(event: MouseEvent): Promise<void> {
      disableEvent(event)
      await send(event)

      mouseJiggler.moveEventCallback()
    }

    // mouse scroll
    async function handleWheel(event: WheelEvent): Promise<void> {
      disableEvent(event)

      const currentTime = Date.now()
      if (currentTime - lastScrollTimeRef.current < scrollInterval) {
        return
      }

      const delta = Math.floor(event.deltaY)
      if (delta === 0) return

      await send(event, delta > 0 ? -1 * scrollDirection : scrollDirection)

      lastScrollTimeRef.current = currentTime
    }

    async function send(event: MouseEvent, scroll: number = 0): Promise<void> {
      const { x, y } = getCorrectedCoords(event.clientX, event.clientY)
      await window.electron.ipcRenderer.invoke(
        IpcEvents.SEND_MOUSE_ABSOLUTE,
        keyRef.current.encode(),
        1,
        1,
        x,
        y,
        scroll
      )
    }

    function getCorrectedCoords(clientX: number, clientY: number) {
      if (!canvas) {
        return { x: 0, y: 0 }
      }

      const rect = canvas.getBoundingClientRect()
      const videoElement = canvas as HTMLVideoElement

      if (!videoElement.videoWidth || !videoElement.videoHeight) {
        const x = (clientX - rect.left) / rect.width
        const y = (clientY - rect.top) / rect.height
        return { x, y }
      }

      const videoRatio = videoElement.videoWidth / videoElement.videoHeight
      const elementRatio = rect.width / rect.height

      let renderedWidth = rect.width
      let renderedHeight = rect.height
      let offsetX = 0
      let offsetY = 0

      if (videoRatio > elementRatio) {
        renderedHeight = rect.width / videoRatio
        offsetY = (rect.height - renderedHeight) / 2
      } else {
        renderedWidth = rect.height * videoRatio
        offsetX = (rect.width - renderedWidth) / 2
      }

      const x = (clientX - rect.left - offsetX) / renderedWidth
      const y = (clientY - rect.top - offsetY) / renderedHeight

      const finalX = Math.max(0, Math.min(1, x))
      const finalY = Math.max(0, Math.min(1, y))

      return { x: finalX, y: finalY }
    }

    return (): void => {
      canvas.removeEventListener('mousemove', handleMouseMove)
      canvas.removeEventListener('mousedown', handleMouseDown)
      canvas.removeEventListener('mouseup', handleMouseUp)
      canvas.removeEventListener('wheel', handleWheel)
      canvas.removeEventListener('click', disableEvent)
      canvas.removeEventListener('contextmenu', disableEvent)
    }
  }, [resolution, scrollDirection, scrollInterval])

  function disableEvent(event: MouseEvent): void {
    event.preventDefault()
    event.stopPropagation()
  }

  return <></>
}
