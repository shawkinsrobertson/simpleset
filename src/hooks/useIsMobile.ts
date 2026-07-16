import { useEffect, useState } from 'react';

/** Tracks a max-width media query so components can pick a touch-first layout instead of relying on CSS alone. */
export function useIsMobile(breakpointPx = 640): boolean {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window === 'undefined' ? false : window.innerWidth < breakpointPx,
  );

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpointPx - 1}px)`);
    const onChange = () => setIsMobile(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [breakpointPx]);

  return isMobile;
}
