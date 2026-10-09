import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./pdf', () => ({ extractTextFromPdf: vi.fn() }));
vi.mock('./aiParse', () => ({
  isAiParseConfigured: vi.fn(),
  buildAiParseInput: vi.fn(),
  parseWithAiBackend: vi.fn(),
}));

import { extractTextFromPdf } from './pdf';
import { isAiParseConfigured, buildAiParseInput, parseWithAiBackend } from './aiParse';
import { parsePdf } from './index';

const fakeFile = new File([new Uint8Array([1])], 'plan.pdf', { type: 'application/pdf' });

afterEach(() => {
  vi.resetAllMocks();
});

describe('parsePdf', () => {
  it('returns the AI-parsed plan when the backend succeeds', async () => {
    vi.mocked(extractTextFromPdf).mockResolvedValue('Day 1: Squat 3x5');
    vi.mocked(isAiParseConfigured).mockReturnValue(true);
    vi.mocked(buildAiParseInput).mockResolvedValue({ text: 'Day 1: Squat 3x5', fallbackName: 'Plan' });
    const aiPlan = { name: 'Plan', days: [{ tempId: 'd1', week: 1, label: 'Day 1', exercises: [], groups: [] }], warnings: [] };
    vi.mocked(parseWithAiBackend).mockResolvedValue(aiPlan);

    const plan = await parsePdf(fakeFile, 'Plan');
    expect(plan).toBe(aiPlan);
  });

  it('falls back to local text parsing (with a warning) when the backend call fails', async () => {
    vi.mocked(extractTextFromPdf).mockResolvedValue('Day 1: Squat 3x5 135lb');
    vi.mocked(isAiParseConfigured).mockReturnValue(true);
    vi.mocked(buildAiParseInput).mockResolvedValue({ text: 'Day 1: Squat 3x5 135lb', fallbackName: 'Plan' });
    vi.mocked(parseWithAiBackend).mockRejectedValue(new Error("You've hit today's AI import limit"));

    const plan = await parsePdf(fakeFile, 'Plan');
    expect(plan.warnings[0]).toMatch(/AI import limit/);
    expect(plan.warnings[0]).toMatch(/Falling back to basic text parsing/);
  });

  it('falls back with a scanned-PDF-specific warning when no text was extracted and the backend is unconfigured', async () => {
    vi.mocked(extractTextFromPdf).mockResolvedValue('');
    vi.mocked(isAiParseConfigured).mockReturnValue(false);

    const plan = await parsePdf(fakeFile, 'Plan');
    expect(plan.warnings[0]).toMatch(/not configured/);
    expect(plan.warnings[0]).toMatch(/No text could be extracted/);
    expect(buildAiParseInput).not.toHaveBeenCalled();
    expect(parseWithAiBackend).not.toHaveBeenCalled();
  });
});
