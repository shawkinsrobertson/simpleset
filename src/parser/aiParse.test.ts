import { afterEach, describe, expect, it, vi } from 'vitest';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock('../lib/supabase', () => ({
  supabase: { functions: { invoke } },
}));

import { buildAiParseInput, buildAiParseInputFromText, buildAiParseInputFromFile, parseWithAiBackend } from './aiParse';

afterEach(() => {
  vi.clearAllMocks();
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
  it('invokes the "parse" Edge Function and returns the parsed plan', async () => {
    const fakePlan = { name: 'Plan', days: [], warnings: [] };
    invoke.mockResolvedValue({ data: fakePlan, error: null, response: undefined });

    const result = await parseWithAiBackend({ text: 'some text', fallbackName: 'Plan' });

    expect(result).toEqual(fakePlan);
    expect(invoke).toHaveBeenCalledWith('parse', { body: { text: 'some text', fallbackName: 'Plan' } });
  });

  it('throws a rate-limit-specific message on 429', async () => {
    invoke.mockResolvedValue({ data: null, error: new Error('fail'), response: { status: 429 } });
    await expect(parseWithAiBackend({ text: 'x', fallbackName: 'Plan' })).rejects.toThrow(/limit/i);
  });

  it('throws a sign-in message on 401', async () => {
    invoke.mockResolvedValue({ data: null, error: new Error('fail'), response: { status: 401 } });
    await expect(parseWithAiBackend({ text: 'x', fallbackName: 'Plan' })).rejects.toThrow(/sign in/i);
  });

  it('throws an error naming the failure on other statuses', async () => {
    invoke.mockResolvedValue({ data: null, error: new Error('boom'), response: { status: 502 } });
    await expect(parseWithAiBackend({ text: 'x', fallbackName: 'Plan' })).rejects.toThrow(/boom/);
  });

  it('throws when the function returns no data and no error', async () => {
    invoke.mockResolvedValue({ data: null, error: null, response: undefined });
    await expect(parseWithAiBackend({ text: 'x', fallbackName: 'Plan' })).rejects.toThrow(/no data/i);
  });
});

describe('parseWithAiBackend (Supabase not configured)', () => {
  it('throws without attempting to invoke anything', async () => {
    vi.resetModules();
    vi.doMock('../lib/supabase', () => ({ supabase: undefined }));
    const { parseWithAiBackend: parseUnconfigured } = await import('./aiParse');

    await expect(parseUnconfigured({ text: 'x', fallbackName: 'Plan' })).rejects.toThrow(/not configured/);
    expect(invoke).not.toHaveBeenCalled();
  });
});
