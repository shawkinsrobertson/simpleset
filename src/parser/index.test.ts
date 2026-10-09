import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./pdf', () => ({ extractTextFromPdf: vi.fn() }));
vi.mock('./aiParse', () => ({
  isAiParseConfigured: vi.fn(),
  buildAiParseInputFromText: vi.fn(),
  buildAiParseInputFromFile: vi.fn(),
  parseWithAiBackend: vi.fn(),
}));

import { extractTextFromPdf } from './pdf';
import { isAiParseConfigured, buildAiParseInputFromText, buildAiParseInputFromFile, parseWithAiBackend } from './aiParse';
import { parsePdf, parsePdfText, parsePdfBytes } from './index';

const fakeFile = new File([new Uint8Array([1])], 'plan.pdf', { type: 'application/pdf' });

afterEach(() => {
  vi.resetAllMocks();
});

describe('parsePdfText', () => {
  it('returns the AI-parsed plan when the backend succeeds', async () => {
    vi.mocked(isAiParseConfigured).mockReturnValue(true);
    vi.mocked(buildAiParseInputFromText).mockReturnValue({ text: 'Day 1: Squat 3x5', fallbackName: 'Plan' });
    const aiPlan = { name: 'Plan', days: [{ tempId: 'd1', week: 1, label: 'Day 1', exercises: [], groups: [] }], warnings: [] };
    vi.mocked(parseWithAiBackend).mockResolvedValue(aiPlan);

    const plan = await parsePdfText('Day 1: Squat 3x5', 'Plan');
    expect(plan).toBe(aiPlan);
    expect(buildAiParseInputFromText).toHaveBeenCalledWith('Day 1: Squat 3x5', 'Plan');
  });

  it('falls back to local text parsing (with a warning) when the backend call fails', async () => {
    vi.mocked(isAiParseConfigured).mockReturnValue(true);
    vi.mocked(buildAiParseInputFromText).mockReturnValue({ text: 'Day 1: Squat 3x5 135lb', fallbackName: 'Plan' });
    vi.mocked(parseWithAiBackend).mockRejectedValue(new Error("You've hit today's AI import limit"));

    const plan = await parsePdfText('Day 1: Squat 3x5 135lb', 'Plan');
    expect(plan.warnings[0]).toMatch(/AI import limit/);
    expect(plan.warnings[0]).toMatch(/Falling back to basic text parsing/);
  });

  it('falls back with a not-configured warning when the backend is unconfigured', async () => {
    vi.mocked(isAiParseConfigured).mockReturnValue(false);

    const plan = await parsePdfText('Day 1: Squat 3x5', 'Plan');
    expect(plan.warnings[0]).toMatch(/not configured/);
    expect(buildAiParseInputFromText).not.toHaveBeenCalled();
    expect(parseWithAiBackend).not.toHaveBeenCalled();
  });
});

describe('parsePdfBytes', () => {
  it('returns the AI-parsed plan when the backend succeeds', async () => {
    vi.mocked(isAiParseConfigured).mockReturnValue(true);
    vi.mocked(buildAiParseInputFromFile).mockResolvedValue({ fileBase64: 'abc', mimeType: 'application/pdf', fallbackName: 'Plan' });
    const aiPlan = { name: 'Plan', days: [{ tempId: 'd1', week: 1, label: 'Day 1', exercises: [], groups: [] }], warnings: [] };
    vi.mocked(parseWithAiBackend).mockResolvedValue(aiPlan);

    const plan = await parsePdfBytes(fakeFile, 'Plan');
    expect(plan).toBe(aiPlan);
    expect(buildAiParseInputFromFile).toHaveBeenCalledWith(fakeFile, 'Plan');
  });

  it('falls back to an empty plan with a scanned-PDF warning when the backend call fails', async () => {
    vi.mocked(isAiParseConfigured).mockReturnValue(true);
    vi.mocked(buildAiParseInputFromFile).mockResolvedValue({ fileBase64: 'abc', mimeType: 'application/pdf', fallbackName: 'Plan' });
    vi.mocked(parseWithAiBackend).mockRejectedValue(new Error('backend unreachable'));

    const plan = await parsePdfBytes(fakeFile, 'Plan');
    expect(plan.warnings[0]).toMatch(/backend unreachable/);
    expect(plan.warnings[0]).toMatch(/No text could be extracted/);
  });

  it('falls back with a not-configured warning when the backend is unconfigured', async () => {
    vi.mocked(isAiParseConfigured).mockReturnValue(false);

    const plan = await parsePdfBytes(fakeFile, 'Plan');
    expect(plan.warnings[0]).toMatch(/not configured/);
    expect(buildAiParseInputFromFile).not.toHaveBeenCalled();
  });
});

describe('parsePdf', () => {
  it('delegates to parsePdfText when embedded text is found', async () => {
    vi.mocked(extractTextFromPdf).mockResolvedValue('Day 1: Squat 3x5');
    vi.mocked(isAiParseConfigured).mockReturnValue(true);
    vi.mocked(buildAiParseInputFromText).mockReturnValue({ text: 'Day 1: Squat 3x5', fallbackName: 'Plan' });
    const aiPlan = { name: 'Plan', days: [], warnings: [] };
    vi.mocked(parseWithAiBackend).mockResolvedValue(aiPlan);

    const plan = await parsePdf(fakeFile, 'Plan');
    expect(plan).toBe(aiPlan);
    expect(buildAiParseInputFromFile).not.toHaveBeenCalled();
  });

  it('delegates to parsePdfBytes when no embedded text is found (scanned PDF)', async () => {
    vi.mocked(extractTextFromPdf).mockResolvedValue('   ');
    vi.mocked(isAiParseConfigured).mockReturnValue(true);
    vi.mocked(buildAiParseInputFromFile).mockResolvedValue({ fileBase64: 'abc', mimeType: 'application/pdf', fallbackName: 'Plan' });
    const aiPlan = { name: 'Plan', days: [], warnings: [] };
    vi.mocked(parseWithAiBackend).mockResolvedValue(aiPlan);

    const plan = await parsePdf(fakeFile, 'Plan');
    expect(plan).toBe(aiPlan);
    expect(buildAiParseInputFromText).not.toHaveBeenCalled();
  });
});
