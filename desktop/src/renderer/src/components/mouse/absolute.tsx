import { ReactElement, useEffect, useRef } from 'react'
import { useAtomValue } from 'jotai'

import { IpcEvents } from '@common/ipc-events'
import { resolutionAtom } from '@renderer/jotai/device'
import { scrollDirectionAtom, scrollIntervalAtom } from '@renderer/jotai/mouse'
import { mouseJiggler } from '@renderer/libs/mouse-jiggler'
import type { Mouse as MouseKey } from '@renderer/types'

export const Absolute = (): ReactElement => {
  const resolution = useAtomValue(resolutionAtom)
  const scrollDirection = useAtomValue(scrollDirectionAtom)
  const scrollInterval = useAtomValue(scrollIntervalAtom)

  const keyRef = useRef<MouseKey>({
    left: false,
    right: false,
    mid: false
  })
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
      const key =
        (keyRef.current.left ? 1 : 0) |
        (keyRef.current.right ? 2 : 0) |
        (keyRef.current.mid ? 4 : 0)

      const rect = canvas!.getBoundingClientRect()
      const x = Math.abs(event.clientX - rect.left)
      const y = Math.abs(event.clientY - rect.top)

      await window.electron.ipcRenderer.invoke(
        IpcEvents.SEND_MOUSE_ABSOLUTE,
        key,
        rect.width,
        rect.height,
        x,
        y,
        scroll
      )
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
