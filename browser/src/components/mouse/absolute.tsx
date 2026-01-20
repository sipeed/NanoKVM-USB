import { useEffect, useRef } from 'react';
import { useAtomValue } from 'jotai';
import { useMediaQuery } from 'react-responsive';

import { createInitialTouchState, createTouchHandlers } from '@/components/mouse/touchpad.ts';
import { MouseAbsoluteEvent } from '@/components/mouse/types.ts';
import { scrollDirectionAtom, scrollIntervalAtom } from '@/jotai/mouse.ts';
import { device } from '@/libs/device';
import { MouseAbsoluteRelative } from '@/libs/mouse';
import { mouseJiggler } from '@/libs/mouse-jiggler';

export const Absolute = () => {
  const isBigScreen = useMediaQuery({ minWidth: 650 });

  const scrollDirection = useAtomValue(scrollDirectionAtom);
  const scrollInterval = useAtomValue(scrollIntervalAtom);

  const mouseRef = useRef(new MouseAbsoluteRelative());
  const lastPosRef = useRef({ x: 0.5, y: 0.5 });
  const lastScrollTimeRef = useRef(0);
  const touchStateRef = useRef(createInitialTouchState());

  useEffect(() => {
    const screen = document.getElementById('video') as HTMLVideoElement;
    if (!screen) return;

    // Add mouse event listeners
    screen.addEventListener('mousedown', handleMouseDown);
    screen.addEventListener('mouseup', handleMouseUp);
    screen.addEventListener('mousemove', handleMouseMove);
    screen.addEventListener('wheel', handleWheel);
    screen.addEventListener('click', disableEvent);
    screen.addEventListener('contextmenu', disableEvent);

    // Create touch handlers
    const touchState = touchStateRef.current;
    const touchHandlers = createTouchHandlers(touchState, {
      scrollDirection,
      scrollInterval,
      getCoordinate,
      handleMouseEvent,
      disableEvent
    });

    // Add touch event listeners (only on big screens)
    if (isBigScreen) {
      screen.addEventListener('touchstart', touchHandlers.handleTouchStart);
      screen.addEventListener('touchmove', touchHandlers.handleTouchMove);
      screen.addEventListener('touchend', touchHandlers.handleTouchEnd);
      screen.addEventListener('touchcancel', touchHandlers.handleTouchCancel);
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
      const { x, y } = getCoordinate(e);
      handleMouseEvent({ type: 'move', x, y });
    }

    // Mouse wheel event
    function handleWheel(e: WheelEvent): void {
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

    // Calculate mouse coordinate
    function getCoordinate(event: { clientX: number; clientY: number }): { x: number; y: number } {
      const rect = screen.getBoundingClientRect();

      const clientX = event.clientX;
      const clientY = event.clientY;

      if (!screen.videoWidth || !screen.videoHeight) {
        const x = (clientX - rect.left) / rect.width;
        const y = (clientY - rect.top) / rect.height;
        return { x, y };
      }

      const videoRatio = screen.videoWidth / screen.videoHeight;
      const elementRatio = rect.width / rect.height;

      let renderedWidth = rect.width;
      let renderedHeight = rect.height;
      let offsetX = 0;
      let offsetY = 0;

      if (videoRatio > elementRatio) {
        renderedHeight = rect.width / videoRatio;
        offsetY = (rect.height - renderedHeight) / 2;
      } else {
        renderedWidth = rect.height * videoRatio;
        offsetX = (rect.width - renderedWidth) / 2;
      }

      const x = (clientX - rect.left - offsetX) / renderedWidth;
      const y = (clientY - rect.top - offsetY) / renderedHeight;
      return { x, y };
    }

    return () => {
      screen.removeEventListener('mousedown', handleMouseDown);
      screen.removeEventListener('mouseup', handleMouseUp);
      screen.removeEventListener('mousemove', handleMouseMove);
      screen.removeEventListener('wheel', handleWheel);
      screen.removeEventListener('click', disableEvent);
      screen.removeEventListener('contextmenu', disableEvent);
      screen.removeEventListener('touchstart', touchHandlers.handleTouchStart);
      screen.removeEventListener('touchmove', touchHandlers.handleTouchMove);
      screen.removeEventListener('touchend', touchHandlers.handleTouchEnd);
      screen.removeEventListener('touchcancel', touchHandlers.handleTouchCancel);

      touchHandlers.cleanup();
    };
  }, [isBigScreen, scrollDirection, scrollInterval]);

  // Mouse event handler
  async function handleMouseEvent(event: MouseAbsoluteEvent): Promise<void> {
    let report: number[];
    const mouse = mouseRef.current;

    switch (event.type) {
      case 'mousedown':
        mouse.buttonDown(event.button);
        report = mouse.buildButtonReport(lastPosRef.current.x, lastPosRef.current.y);
        break;
      case 'mouseup':
        mouse.buttonUp(event.button);
        report = mouse.buildButtonReport(lastPosRef.current.x, lastPosRef.current.y);
        break;
      case 'wheel':
        report = mouse.buildReport(lastPosRef.current.x, lastPosRef.current.y, event.deltaY);
        break;
      case 'move':
        report = mouse.buildReport(event.x, event.y);
        lastPosRef.current = { x: event.x, y: event.y };
        break;
      default:
        report = mouse.buildReport(lastPosRef.current.x, lastPosRef.current.y);
        break;
    }

    await device.sendMouseData([0x02, ...report]);

    mouseJiggler.moveEventCallback();
  }

  // Disable default events
  function disableEvent(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
  }

  return <></>;
};
