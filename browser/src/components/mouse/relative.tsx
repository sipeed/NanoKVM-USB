import { useEffect, useRef } from 'react';
import { message } from 'antd';
import { useAtomValue, useSetAtom } from 'jotai';
import { useTranslation } from 'react-i18next';

import { resolutionAtom } from '@/jotai/device.ts';
import {
  mouseJigglerModeAtom,
  mouseLastMoveTimeAtom,
  scrollDirectionAtom,
  scrollIntervalAtom
} from '@/jotai/mouse.ts';
import { device } from '@/libs/device';
import { Key } from '@/libs/device/mouse.ts';

export const Relative = () => {
  const { t } = useTranslation();
  const [messageApi, contextHolder] = message.useMessage();

  const resolution = useAtomValue(resolutionAtom);
  const scrollDirection = useAtomValue(scrollDirectionAtom);
  const scrollInterval = useAtomValue(scrollIntervalAtom);
  const mouseJigglerMode = useAtomValue(mouseJigglerModeAtom);
  const setMouseLastMoveTime = useSetAtom(mouseLastMoveTimeAtom);

  const isLockedRef = useRef(false);
  const keyRef = useRef<Key>(new Key());
  const lastScrollTimeRef = useRef(0);

  useEffect(() => {
    messageApi.open({
      key: 'relative',
      type: 'info',
      content: t('mouse.requestPointer'),
      duration: 3,
      style: {
        marginTop: '40vh'
      }
    });
  }, []);

  // listen mouse events
  useEffect(() => {
    const canvas = document.getElementById('video');
    if (!canvas) return;

    document.addEventListener('pointerlockchange', handlePointerLockChange);
    canvas.addEventListener('click', handleClick);
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('wheel', handleWheel);
    canvas.addEventListener('contextmenu', disableEvent);

    function handleClick(event: any) {
      disableEvent(event);

      if (!isLockedRef.current) {
        canvas!.requestPointerLock();
      }
    }

    function handlePointerLockChange() {
      isLockedRef.current = document.pointerLockElement === canvas;
    }

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

      await send(0, 0, 0);
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

      await send(0, 0, 0);
    }

    // mouse move
    async function handleMouseMove(event: any) {
      disableEvent(event);

      const x = event.movementX || event.mozMovementX || event.webkitMovementX || 0;
      const y = event.movementY || event.mozMovementY || event.webkitMovementY || 0;
      if (x === 0 && y === 0) return;

      await send(Math.abs(x) < 10 ? x * 2 : x, Math.abs(y) < 10 ? y * 2 : y, 0);

      // mouse jiggler record last move time
      if (mouseJigglerMode === 'enable') {
        setMouseLastMoveTime(Date.now());
      }
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

      await send(0, 0, delta > 0 ? -1 * scrollDirection : scrollDirection);

      lastScrollTimeRef.current = currentTime;
    }

    return () => {
      document.removeEventListener('pointerlockchange', handlePointerLockChange);
      canvas.removeEventListener('click', handleClick);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('contextmenu', disableEvent);
    };
  }, [resolution, scrollDirection, scrollInterval, mouseJigglerMode, setMouseLastMoveTime]);

  async function send(x: number, y: number, scroll: number) {
    await device.sendMouseRelativeData(keyRef.current, x, y, scroll);
  }

  // disable default events
  function disableEvent(event: any) {
    event.preventDefault();
    event.stopPropagation();
  }

  return <>{contextHolder}</>;
};
