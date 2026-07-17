import { useEffect, useState } from 'react';
import {
  applyTheme,
  getStoredContrast,
  getStoredMode,
  setStoredContrast,
  setStoredMode,
  type ColorMode,
  type Contrast,
} from '../lib/theme';

export function useTheme() {
  const [mode, setMode] = useState<ColorMode>(() => getStoredMode());
  const [contrast, setContrast] = useState<Contrast>(() => getStoredContrast());

  useEffect(() => {
    applyTheme(mode, contrast);
  }, [mode, contrast]);

  useEffect(() => {
    if (mode !== 'system') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme(mode, contrast);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [mode, contrast]);

  const updateMode = (next: ColorMode) => {
    setStoredMode(next);
    setMode(next);
  };
  const updateContrast = (next: Contrast) => {
    setStoredContrast(next);
    setContrast(next);
  };

  return { mode, contrast, setMode: updateMode, setContrast: updateContrast };
}
