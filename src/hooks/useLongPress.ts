import { useRef } from 'react';

const LONG_PRESS_MS = 500;
const MOVE_CANCEL_PX = 10;

/**
 * Long-press (touch) / right-click (desktop) → same action, matching the
 * "highlight rows to group" gesture from the spec. Movement beyond a small
 * threshold before the timer fires cancels it, so it doesn't trigger
 * mid-scroll.
 */
export function useLongPress(onTrigger: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    start.current = null;
  };

  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse') return; // mouse uses onContextMenu instead
      start.current = { x: e.clientX, y: e.clientY };
      timer.current = setTimeout(() => {
        onTrigger();
        clear();
      }, LONG_PRESS_MS);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (!start.current) return;
      const dx = Math.abs(e.clientX - start.current.x);
      const dy = Math.abs(e.clientY - start.current.y);
      if (dx > MOVE_CANCEL_PX || dy > MOVE_CANCEL_PX) clear();
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      onTrigger();
    },
  };
}
