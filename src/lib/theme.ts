export type ColorMode = 'light' | 'dark' | 'system';
export type Contrast = 'soft' | 'high';

const MODE_KEY = 'simpleset:color-mode';
const CONTRAST_KEY = 'simpleset:contrast';

export function getStoredMode(): ColorMode {
  const stored = localStorage.getItem(MODE_KEY);
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
}

export function getStoredContrast(): Contrast {
  return localStorage.getItem(CONTRAST_KEY) === 'high' ? 'high' : 'soft';
}

export function setStoredMode(mode: ColorMode): void {
  localStorage.setItem(MODE_KEY, mode);
}

export function setStoredContrast(contrast: Contrast): void {
  localStorage.setItem(CONTRAST_KEY, contrast);
}

export function resolveMode(mode: ColorMode): 'light' | 'dark' {
  if (mode !== 'system') return mode;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(mode: ColorMode, contrast: Contrast): void {
  document.documentElement.setAttribute('data-mode', resolveMode(mode));
  document.documentElement.setAttribute('data-contrast', contrast);
}
