import { useEffect, useRef } from 'react';
import { useAtomValue } from 'jotai';

import { resolutionAtom, videoRotationAtom } from '@/jotai/device.ts';
import { scrollDirectionAtom, scrollIntervalAtom } from '@/jotai/mouse.ts';
import { device } from '@/libs/device';
import { Key } from '@/libs/device/mouse.ts';
import { mouseJiggler } from '@/libs/mouse-jiggler';

export const Absolute = () => {
  const resolution = useAtomValue(resolutionAtom);
  const videoRotation = useAtomValue(videoRotationAtom);
  const scrollDirection = useAtomValue(scrollDirectionAtom);
  const scrollInterval = useAtomValue(scrollIntervalAtom);

  const keyRef = useRef<Key>(new Key());
  const lastScrollTimeRef = useRef(0);

  // listen mouse events
  useEffect(() => {
    const canvas = document.getElementById('video');
    if (!canvas) return;

    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('wheel', handleWheel);
    canvas.addEventListener('click', disableEvent);
    canvas.addEventListener('contextmenu', disableEvent);

    // press button
    async function handleMouseDown(event: any) {
      disableEvent(event);

      switch (event.button) {
        case 0:
          keyRef.current.left = true;
          break;
        case 1:
          keyRef.current.mid = true;
          break;
        case 2:
          keyRef.current.right = true;
          break;
        default:
          console.log(`unknown button ${event.button}`);
          return;
      }

      await send(event);
    }

    // release button
    async function handleMouseUp(event: any) {
      disableEvent(event);

      switch (event.button) {
        case 0:
          keyRef.current.left = false;
          break;
        case 1:
          keyRef.current.mid = false;
          break;
        case 2:
          keyRef.current.right = false;
          break;
        default:
          console.log(`unknown button ${event.button}`);
          return;
      }

      await send(event);
    }

    // mouse move
    async function handleMouseMove(event: any) {
      disableEvent(event);
      await send(event);

      mouseJiggler.moveEventCallback();
    }

    // mouse scroll
    async function handleWheel(event: any) {
      disableEvent(event);

      const currentTime = Date.now();
      if (currentTime - lastScrollTimeRef.current < scrollInterval) {
        return;
      }

      const delta = Math.floor(event.deltaY);
      if (delta === 0) return;

      await send(event, delta > 0 ? -1 * scrollDirection : scrollDirection);

      lastScrollTimeRef.current = currentTime;
    }

    async function send(event: MouseEvent, scroll: number = 0) {
      const { x, y } = getCorrectedCoords(event.clientX, event.clientY);
      await device.sendMouseAbsoluteData(keyRef.current, 1, 1, x, y, scroll);
    }

    function getCorrectedCoords(clientX: number, clientY: number) {
      if (!canvas) {
        return { x: 0, y: 0 };
      }

      const rect = canvas.getBoundingClientRect();
      const videoElement = canvas as HTMLVideoElement;

      const videoWidth = videoElement.videoWidth || 1920;
      const videoHeight = videoElement.videoHeight || 1080;

      const screenVideoRatio =
        videoRotation === 90 || videoRotation === 270
          ? videoHeight / videoWidth
          : videoWidth / videoHeight;

      const containerWidth = rect.width;
      const containerHeight = rect.height;
      const containerRatio = containerWidth / containerHeight;

      let renderedWidth: number;
      let renderedHeight: number;

      if (screenVideoRatio > containerRatio) {
        renderedWidth = containerWidth;
        renderedHeight = containerWidth / screenVideoRatio;
      } else {
        renderedHeight = containerHeight;
        renderedWidth = containerHeight * screenVideoRatio;
      }

      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const relX = clientX - centerX;
      const relY = clientY - centerY;

      let x = relX / renderedWidth + 0.5;
      let y = relY / renderedHeight + 0.5;

      x = Math.max(0, Math.min(1, x));
      y = Math.max(0, Math.min(1, y));

      return { x, y };
    }

    return () => {
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('click', disableEvent);
      canvas.removeEventListener('contextmenu', disableEvent);
    };
  }, [resolution, scrollDirection, scrollInterval, videoRotation]);

  // disable default events
  function disableEvent(event: any) {
    event.preventDefault();
    event.stopPropagation();
  }

  return <></>;
};
