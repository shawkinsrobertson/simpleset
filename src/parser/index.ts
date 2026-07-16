import { detectFileKind } from './types';
import type { ParsedPlan } from './types';
import { parsePlanText } from './textParser';
import { extractTextFromDocx } from './docx';
import { extractTextFromPdf } from './pdf';
import { parseCsvText, parseXlsxFile } from './xlsx';

export type { ParsedPlan, ParsedDay, ParsedExercise } from './types';
export { detectFileKind } from './types';

function fallbackNameFromFile(file: File): string {
  return file.name.replace(/\.[^.]+$/, '');
}

export async function parseFile(file: File): Promise<ParsedPlan> {
  const kind = detectFileKind(file);
  const fallbackName = fallbackNameFromFile(file);

  if (!kind) {
    throw new Error(
      `Unsupported file type: "${file.name}". SimpleSet supports .docx, .xlsx, .pdf, and .txt files.`,
    );
  }

  switch (kind) {
    case 'docx': {
      const text = await extractTextFromDocx(file);
      return parsePlanText(text, fallbackName);
    }
    case 'pdf': {
      const text = await extractTextFromPdf(file);
      const plan = parsePlanText(text, fallbackName);
      if (!text.trim()) {
        plan.warnings.unshift(
          'No text could be extracted from this PDF. Scanned/image-only PDFs are not supported in V1 — try exporting as a Word doc or spreadsheet instead.',
        );
      }
      return plan;
    }
    case 'xlsx':
      return parseXlsxFile(file, fallbackName);
    case 'text': {
      const text = await file.text();
      return parsePlanText(text, fallbackName);
    }
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
