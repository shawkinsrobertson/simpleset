import { detectFileKind } from './types';
import type { ParsedPlan } from './types';
import { parsePlanText } from './textParser';
import { extractTextFromDocx } from './docx';
import { extractTextFromPdf } from './pdf';
import { parseCsvText, parseXlsxFile } from './xlsx';
import { buildAiParseInput, isAiParseConfigured, parseWithAiBackend } from './aiParse';

export type { ParsedPlan, ParsedDay, ParsedExercise } from './types';
export { detectFileKind } from './types';
export { scanSections, needsSectionPicker, filterTextToSections } from './sectionScanner';
export type { DocumentSection } from './sectionScanner';
export { extractTextFromPdf } from './pdf';
export { extractTextFromDocx } from './docx';
export { parsePlanText } from './textParser';
export { isAiParseConfigured } from './aiParse';
export type { AiParseInput } from './aiParse';

function fallbackNameFromFile(file: File): string {
  return file.name.replace(/\.[^.]+$/, '');
}

export async function parseFile(file: File): Promise<ParsedPlan> {
  const kind = detectFileKind(file);
  const fallbackName = fallbackNameFromFile(file);

  if (!kind) {
    throw new Error(
      `Unsupported file type: "${file.name}". simpleSet supports .docx, .xlsx, .pdf, and .txt files.`,
    );
  }

  switch (kind) {
    case 'docx': {
      const text = await extractTextFromDocx(file);
      return parsePlanText(text, fallbackName);
    }
    case 'pdf':
      return parsePdf(file, fallbackName);
    case 'xlsx':
      return parseXlsxFile(file, fallbackName);
    case 'text': {
      const text = await file.text();
      return parsePlanText(text, fallbackName);
    }
  }
}

/**
 * PDF parsing is a paid, AI-assisted feature: embedded text (or raw bytes,
 * for scanned PDFs) is sent to the backend for OCR + structuring. If the
 * backend is unconfigured, rate-limited, or unreachable, falls back to the
 * local regex parser on whatever text could be extracted so import never
 * hard-fails.
 */
export async function parsePdf(file: File, fallbackName: string): Promise<ParsedPlan> {
  const text = await extractTextFromPdf(file);

  try {
    if (!isAiParseConfigured()) {
      throw new Error('AI-assisted PDF import is not configured for this deployment.');
    }
    const input = await buildAiParseInput(file, text, fallbackName);
    return await parseWithAiBackend(input);
  } catch (e) {
    const plan = parsePlanText(text, fallbackName);
    const reason = e instanceof Error ? e.message : 'AI-assisted PDF import failed.';
    plan.warnings.unshift(
      text.trim()
        ? `${reason} Falling back to basic text parsing, which may be less accurate.`
        : `${reason} No text could be extracted from this PDF either — try exporting as a Word doc or spreadsheet instead.`,
    );
    return plan;
  }
}

/** Parses plain text already extracted elsewhere (e.g. a Google Doc export). */
export function parseText(text: string, fallbackName: string): ParsedPlan {
  return parsePlanText(text, fallbackName);
}

/** Parses CSV text already extracted elsewhere (e.g. a Google Sheet export). */
export function parseCsv(text: string, fallbackName: string): ParsedPlan {
  return parseCsvText(text, fallbackName);
}
