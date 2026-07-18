import { useEffect, useRef, useState } from 'react';
import Card from './Card';
import { formatSeconds } from '../lib/targets';
import { useWakeLock } from '../hooks/useWakeLock';

interface RestTimerProps {
  seconds: number;
  onDone: () => void;
}

const ADJUST_STEP = 15;
const COMPLETE_LINGER_MS = 1400;

/** Countdown shown between sets. Keeps the screen awake and vibrates + shows a confirmation on completion, then hands control back. */
export default function RestTimer({ seconds, onDone }: RestTimerProps) {
  const [remaining, setRemaining] = useState(seconds);
  const [complete, setComplete] = useState(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useWakeLock(!complete);

  useEffect(() => {
    if (complete) return;
    const id = window.setInterval(() => {
      setRemaining((r) => Math.max(0, r - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [complete]);

  // Detect completion — separate from the effect below so setting `complete`
  // here doesn't re-trigger itself and clear the hand-back timer before it fires.
  useEffect(() => {
    if (remaining > 0 || complete) return;
    setComplete(true);
    if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
  }, [remaining, complete]);

  useEffect(() => {
    if (!complete) return;
    const doneTimer = window.setTimeout(() => onDoneRef.current(), COMPLETE_LINGER_MS);
    return () => window.clearTimeout(doneTimer);
  }, [complete]);

  const adjust = (delta: number) => setRemaining((r) => Math.max(0, r + delta));

  return (
    <Card state="active" className="p-4 text-center">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Rest</p>
      {complete ? (
        <p className="mt-2 text-lg font-semibold text-accent">Rest complete ✓</p>
      ) : (
        <>
          <p className="mt-1 font-mono text-4xl font-extralight text-text">{formatSeconds(remaining)}</p>
          <div className="mt-3 flex items-center justify-center gap-3">
            <button onClick={() => adjust(-ADJUST_STEP)} className="btn-secondary px-3 py-1.5 text-sm">
              −{ADJUST_STEP}s
            </button>
            <button onClick={() => adjust(ADJUST_STEP)} className="btn-secondary px-3 py-1.5 text-sm">
              +{ADJUST_STEP}s
            </button>
          </div>
          <button onClick={onDone} className="mt-3 w-full text-sm font-medium text-text-secondary">
            Skip rest
          </button>
        </>
      )}
    </Card>
  );
}
