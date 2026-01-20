import { MouseButton } from './types';
import type { MouseAbsoluteEvent } from './types';

// Touch event thresholds
const TAP_THRESHOLD = 8;
const DRAG_THRESHOLD = 10;
const VELOCITY_THRESHOLD = 0.3;
const LONG_PRESS_DELAY = 800;

export interface TouchHandlerOptions {
  scrollDirection: number;
  scrollInterval: number;
  getCoordinate: (event: { clientX: number; clientY: number }) => { x: number; y: number };
  handleMouseEvent: (event: MouseAbsoluteEvent) => void;
  disableEvent: (event: Event) => void;
}

export interface TouchState {
  touchStartTime: number;
  lastTouchY: number;
  longPressTimer: ReturnType<typeof setTimeout> | null;
  isLongPress: boolean;
  hasMove: boolean;
  isDragging: boolean;
  pressedButton: MouseButton | null;
  touchStartPos: { x: number; y: number };
  lastScrollTime: number;
}

export function createInitialTouchState(): TouchState {
  return {
    touchStartTime: 0,
    lastTouchY: 0,
    longPressTimer: null,
    isLongPress: false,
    hasMove: false,
    isDragging: false,
    pressedButton: null,
    touchStartPos: { x: 0, y: 0 },
    lastScrollTime: 0
  };
}

export function createTouchHandlers(state: TouchState, options: TouchHandlerOptions) {
  const { scrollDirection, scrollInterval, getCoordinate, handleMouseEvent, disableEvent } =
    options;

  function handleTouchStart(e: TouchEvent): void {
    disableEvent(e);

    if (e.touches.length === 0) {
      return;
    }

    const touch = e.touches[0];

    // Reset states
    state.touchStartTime = Date.now();
    state.lastTouchY = touch.clientY;
    state.isLongPress = false;
    state.hasMove = false;
    state.isDragging = false;
    state.pressedButton = null;
    state.touchStartPos = { x: touch.clientX, y: touch.clientY };

    if (state.longPressTimer) {
      clearTimeout(state.longPressTimer);
    }

    const { x, y } = getCoordinate(touch);
    handleMouseEvent({ type: 'move', x, y });

    if (e.touches.length > 1) {
      return;
    }

    // Start long press timer
    state.longPressTimer = setTimeout(() => {
      state.isLongPress = true;
      state.pressedButton = MouseButton.Right;
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }

      handleMouseEvent({ type: 'mousedown', button: MouseButton.Right });
    }, LONG_PRESS_DELAY);
  }

  function handleTouchMove(e: TouchEvent): void {
    disableEvent(e);

    if (e.touches.length === 0) {
      return;
    }
    const touch = e.touches[0];

    // Handle two-finger scroll first
    if (e.touches.length > 1) {
      const currentTime = Date.now();
      if (currentTime - state.lastScrollTime < scrollInterval) {
        return;
      }

      const deltaY = (touch.clientY - state.lastTouchY > 0 ? 1 : -1) * scrollDirection;
      handleMouseEvent({ type: 'wheel', deltaY });

      state.lastTouchY = touch.clientY;
      state.lastScrollTime = currentTime;
      return;
    }

    const deltaX = Math.abs(touch.clientX - state.touchStartPos.x);
    const deltaY = Math.abs(touch.clientY - state.touchStartPos.y);
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    const timeDelta = Date.now() - state.touchStartTime;
    const velocity = timeDelta > 0 ? distance / timeDelta : 0;

    const shouldStartDrag =
      distance > DRAG_THRESHOLD || (distance > TAP_THRESHOLD && velocity > VELOCITY_THRESHOLD);

    if (shouldStartDrag && !state.isDragging && !state.isLongPress) {
      if (!state.hasMove) {
        state.hasMove = true;
      }

      if (state.longPressTimer) {
        clearTimeout(state.longPressTimer);
        state.longPressTimer = null;
      }

      if (state.pressedButton === null) {
        state.isDragging = true;
        state.pressedButton = MouseButton.Left;
        handleMouseEvent({ type: 'mousedown', button: MouseButton.Left });
      }
    }

    if (distance > TAP_THRESHOLD && !state.hasMove) {
      state.hasMove = true;
    }

    if (state.isDragging || state.isLongPress) {
      const { x, y } = getCoordinate(touch);
      handleMouseEvent({ type: 'move', x, y });
    }
  }

  function handleTouchEnd(e: TouchEvent): void {
    disableEvent(e);

    if (state.longPressTimer) {
      clearTimeout(state.longPressTimer);
      state.longPressTimer = null;
    }

    if (!state.hasMove && !state.isLongPress) {
      handleMouseEvent({ type: 'mousedown', button: MouseButton.Left });
      setTimeout(() => {
        handleMouseEvent({ type: 'mouseup', button: MouseButton.Left });
      }, 50);
    } else if (state.pressedButton !== null) {
      handleMouseEvent({ type: 'mouseup', button: state.pressedButton });
    }

    resetTouchState();
  }

  function handleTouchCancel(e: TouchEvent): void {
    disableEvent(e);

    if (state.longPressTimer) {
      clearTimeout(state.longPressTimer);
      state.longPressTimer = null;
    }

    if (state.pressedButton !== null) {
      handleMouseEvent({ type: 'mouseup', button: state.pressedButton });
    }

    resetTouchState();
  }

  function resetTouchState(): void {
    state.isLongPress = false;
    state.hasMove = false;
    state.isDragging = false;
    state.pressedButton = null;
  }

  function cleanup(): void {
    if (state.longPressTimer) {
      clearTimeout(state.longPressTimer);
      state.longPressTimer = null;
    }
  }

  return {
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleTouchCancel,
    cleanup
  };
}
