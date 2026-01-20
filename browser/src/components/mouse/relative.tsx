import { useEffect, useRef } from 'react';
import { message } from 'antd';
import { useAtomValue } from 'jotai';
import { useTranslation } from 'react-i18next';

import { MouseRelativeEvent } from '@/components/mouse/types.ts';
import { scrollDirectionAtom, scrollIntervalAtom } from '@/jotai/mouse.ts';
import { device } from '@/libs/device';
import { MouseReportRelative } from '@/libs/mouse';
import { mouseJiggler } from '@/libs/mouse-jiggler';

export const Relative = () => {
  const { t } = useTranslation();
  const [messageApi, contextHolder] = message.useMessage();

  const scrollDirection = useAtomValue(scrollDirectionAtom);
  const scrollInterval = useAtomValue(scrollIntervalAtom);

  const mouseRef = useRef(new MouseReportRelative());
  const isLockedRef = useRef(false);
  const lastScrollTimeRef = useRef(0);

  showMessage();

  useEffect(() => {
    const screen = document.getElementById('video');
    if (!screen) return;

    screen.addEventListener('click', handleClick);
    screen.addEventListener('mousedown', handleMouseDown);
    screen.addEventListener('mouseup', handleMouseUp);
    screen.addEventListener('mousemove', handleMouseMove);
    screen.addEventListener('wheel', handleMouseWheel);
    screen.addEventListener('contextmenu', disableEvent);
    document.addEventListener('pointerlockchange', handlePointerLockChange);

    // Click to request pointer lock
    function handleClick(event: MouseEvent): void {
      disableEvent(event);

      if (!isLockedRef.current) {
        screen?.requestPointerLock();
      }
    }

    // Mouse down event
    function handleMouseDown(e: MouseEvent): void {
      disableEvent(e);
      handleMouseEvent({ type: 'mousedown', button: e.button });
    }

    // Mouse up event
    function handleMouseUp(e: MouseEvent): void {
      disableEvent(e);
      handleMouseEvent({ type: 'mouseup', button: e.button });
    }

    // Mouse move event
    function handleMouseMove(e: MouseEvent): void {
      disableEvent(e);

      const x = e.movementX || 0;
      const y = e.movementY || 0;
      if (x === 0 && y === 0) return;

      const deltaX = Math.abs(x * window.devicePixelRatio) < 10 ? x * 2 : x;
      const deltaY = Math.abs(y * window.devicePixelRatio) < 10 ? y * 2 : y;

      handleMouseEvent({ type: 'move', deltaX, deltaY });
    }

    // Mouse wheel event
    function handleMouseWheel(e: WheelEvent): void {
      disableEvent(e);

      if (Math.floor(e.deltaY) === 0) {
        return;
      }

      const currentTime = Date.now();
      if (currentTime - lastScrollTimeRef.current < scrollInterval) {
        return;
      }

      const deltaY = (e.deltaY > 0 ? 1 : -1) * scrollDirection;
      handleMouseEvent({ type: 'wheel', deltaY });
      lastScrollTimeRef.current = currentTime;
    }

    // Pointer lock state change
    function handlePointerLockChange(): void {
      isLockedRef.current = document.pointerLockElement === screen;
    }

    return (): void => {
      // Exit pointer lock when component unmounts
      if (document.pointerLockElement === screen) {
        document.exitPointerLock();
      }

      screen.removeEventListener('click', handleClick);
      screen.removeEventListener('mousedown', handleMouseDown);
      screen.removeEventListener('mouseup', handleMouseUp);
      screen.removeEventListener('mousemove', handleMouseMove);
      screen.removeEventListener('wheel', handleMouseWheel);
      screen.removeEventListener('contextmenu', disableEvent);
      document.removeEventListener('pointerlockchange', handlePointerLockChange);
    };
  }, [scrollDirection, scrollInterval]);

  // Mouse handler
  async function handleMouseEvent(event: MouseRelativeEvent): Promise<void> {
    let report: number[];
    const mouse = mouseRef.current;

    switch (event.type) {
      case 'mousedown':
        mouse.buttonDown(event.button);
        report = mouse.buildButtonReport();
        break;
      case 'mouseup':
        mouse.buttonUp(event.button);
        report = mouse.buildButtonReport();
        break;
      case 'wheel':
        report = mouse.buildReport(0, 0, event.deltaY);
        break;
      case 'move':
        report = mouse.buildReport(event.deltaX, event.deltaY);
        break;
      default:
        report = mouse.buildReport(0, 0);
        break;
    }

    await device.sendMouseData([0x01, ...report]);

    mouseJiggler.moveEventCallback();
  }

  function showMessage(): void {
    messageApi.open({
      key: 'requestPointer',
      type: 'info',
      content: t('mouse.requestPointer'),
      duration: 3,
      style: {
        marginTop: '40vh'
      }
    });
  }

  function disableEvent(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
  }

  return <>{contextHolder}</>;
};
