import { useEffect, useRef } from 'react';
import { useAtom, useAtomValue } from 'jotai';

import {
  mouseJigglerIntervalAtom,
  mouseJigglerModeAtom,
  mouseJigglerTimerAtom,
  mouseLastMoveTimeAtom,
  mouseModeAtom
} from '@/jotai/mouse.ts';
import { device } from '@/libs/device/index.ts';
import { Key } from '@/libs/device/mouse.ts';

import { Absolute } from './absolute.tsx';
import { Relative } from './relative.tsx';

export const Mouse = () => {
  const mouseMode = useAtomValue(mouseModeAtom);

  // mouse jiggler
  const mouseJigglerMode = useAtomValue(mouseJigglerModeAtom);
  const [mouseJigglerTimer, setMouseJigglerTimer] = useAtom(mouseJigglerTimerAtom);
  const mouseJigglerInterval = useAtomValue(mouseJigglerIntervalAtom);
  const mouseLastMoveTime = useAtomValue(mouseLastMoveTimeAtom);
  const mouseLastMoveTimeRef = useRef(mouseLastMoveTime);
  const emptyKeyRef = useRef<Key>(new Key());
  useEffect(() => {
    // sync mouseLastMoveTime through ref
    mouseLastMoveTimeRef.current = mouseLastMoveTime;
  }, [mouseLastMoveTime]);
  useEffect(() => {
    async function jigglerTimerCallback() {
      if (Date.now() - mouseLastMoveTimeRef.current < mouseJigglerInterval) {
        return;
      }

      const rect = document.getElementById('video')!.getBoundingClientRect();

      await device.sendMouseAbsoluteData(
        emptyKeyRef.current,
        rect.width,
        rect.height,
        rect.width / 2,
        rect.height / 2,
        0
      );
    }

    // configure interval timer
    if (mouseJigglerMode === 'enable') {
      if (mouseJigglerTimer === null) {
        const timer = setInterval(jigglerTimerCallback, mouseJigglerInterval);
        setMouseJigglerTimer(timer);
      }
    } else {
      if (mouseJigglerTimer) {
        clearInterval(mouseJigglerTimer);
        setMouseJigglerTimer(null);
      }
    }
  }, [mouseJigglerMode]);

  return <>{mouseMode === 'relative' ? <Relative /> : <Absolute />}</>;
};
