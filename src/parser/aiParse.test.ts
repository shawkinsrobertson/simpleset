import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildAiParseInput,
  buildAiParseInputFromText,
  buildAiParseInputFromFile,
  isAiParseConfigured,
  parseWithAiBackend,
} from './aiParse';

function fakeLocalStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
  };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', fakeLocalStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('isAiParseConfigured', () => {
  it('is false when VITE_PARSE_API_URL is unset', () => {
    vi.stubEnv('VITE_PARSE_API_URL', '');
    expect(isAiParseConfigured()).toBe(false);
  });

  it('is true when VITE_PARSE_API_URL is set', () => {
    vi.stubEnv('VITE_PARSE_API_URL', 'https://api.example.com');
    expect(isAiParseConfigured()).toBe(true);
  });
});

describe('buildAiParseInputFromText', () => {
  it('builds a text-only input, synchronously', () => {
    const input = buildAiParseInputFromText('Day 1: Squat 3x5', 'My Plan');
    expect(input).toEqual({ text: 'Day 1: Squat 3x5', fallbackName: 'My Plan' });
  });
});

describe('buildAiParseInputFromFile', () => {
  it('base64-encodes the file and tags its mime type', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'scanned.pdf', { type: 'application/pdf' });
    const input = await buildAiParseInputFromFile(file, 'Scanned Plan');
    expect(input.text).toBeUndefined();
    expect(input.fallbackName).toBe('Scanned Plan');
    expect(input.mimeType).toBe('application/pdf');
    expect(typeof input.fileBase64).toBe('string');
    expect(input.fileBase64!.length).toBeGreaterThan(0);
  });

  it('falls back to application/pdf when the file has no type', async () => {
    const file = new File([new Uint8Array([1])], 'scanned.pdf');
    const input = await buildAiParseInputFromFile(file, 'Plan');
    expect(input.mimeType).toBe('application/pdf');
  });
});

describe('buildAiParseInput', () => {
  it('sends extracted text when available, not raw bytes', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'plan.pdf', { type: 'application/pdf' });
    const input = await buildAiParseInput(file, 'Day 1: Squat 3x5', 'My Plan');
    expect(input).toEqual({ text: 'Day 1: Squat 3x5', fallbackName: 'My Plan' });
  });

  it('falls back to base64 file bytes when no text was extracted', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'scanned.pdf', { type: 'application/pdf' });
    const input = await buildAiParseInput(file, '   ', 'Scanned Plan');
    expect(input.text).toBeUndefined();
    expect(input.fallbackName).toBe('Scanned Plan');
    expect(input.mimeType).toBe('application/pdf');
    expect(typeof input.fileBase64).toBe('string');
    expect(input.fileBase64!.length).toBeGreaterThan(0);
  });
});

describe('parseWithAiBackend', () => {
  it('throws when the backend url is not configured', async () => {
    vi.stubEnv('VITE_PARSE_API_URL', '');
    await expect(parseWithAiBackend({ text: 'x', fallbackName: 'Plan' })).rejects.toThrow(/not configured/);
  });

  it('posts to <baseUrl>/parse with a device id header and returns the parsed plan', async () => {
    vi.stubEnv('VITE_PARSE_API_URL', 'https://api.example.com');
    const fakePlan = { name: 'Plan', days: [], warnings: [] };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => fakePlan });
    vi.stubGlobal('fetch', fetchMock);

    const result = await parseWithAiBackend({ text: 'some text', fallbackName: 'Plan' });

    expect(result).toEqual(fakePlan);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.example.com/parse');
    expect(options.method).toBe('POST');
    expect(options.headers['x-device-id']).toBeTruthy();
    expect(JSON.parse(options.body)).toEqual({ text: 'some text', fallbackName: 'Plan' });
  });

  it('throws a rate-limit-specific message on 429', async () => {
    vi.stubEnv('VITE_PARSE_API_URL', 'https://api.example.com');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }));
    await expect(parseWithAiBackend({ text: 'x', fallbackName: 'Plan' })).rejects.toThrow(/limit/i);
  });

  it('throws a generic error on other failures', async () => {
    vi.stubEnv('VITE_PARSE_API_URL', 'https://api.example.com');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 502 }));
    await expect(parseWithAiBackend({ text: 'x', fallbackName: 'Plan' })).rejects.toThrow(/502/);
  });
});
