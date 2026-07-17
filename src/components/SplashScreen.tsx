import { useEffect, useState } from 'react';
import { useTheme } from '../hooks/useTheme';

interface Props {
  onDone: () => void;
}

export default function SplashScreen({ onDone }: Props) {
  const { mode } = useTheme();
  const [visible, setVisible] = useState(true);

  // Resolve system preference to actual light/dark
  const isDark =
    mode === 'dark' ||
    (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setVisible(false), 1400);
    const doneTimer = setTimeout(onDone, 1800); // after fade completes
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(doneTimer);
    };
  }, [onDone]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg transition-opacity duration-400"
      style={{ opacity: visible ? 1 : 0, pointerEvents: 'none' }}
    >
      <img
        src={isDark ? '/wordmark-dark.png' : '/wordmark-light.png'}
        alt="SimpleSet"
        className="w-56 select-none"
        draggable={false}
      />
    </div>
  );
}
