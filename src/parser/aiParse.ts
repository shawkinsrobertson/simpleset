import type { ParsedPlan } from './types';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

export { isSupabaseConfigured as isAiParseConfigured };

export interface AiParseInput {
  /** Embedded text extracted locally, when the PDF has one — cheaper and more accurate than sending raw bytes. */
  text?: string;
  /** Raw file bytes, base64-encoded, sent only when no embedded text could be extracted (e.g. a scanned PDF). */
  fileBase64?: string;
  mimeType?: string;
  fallbackName: string;
}

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function buildAiParseInputFromText(text: string, fallbackName: string): AiParseInput {
  return { text, fallbackName };
}

export async function buildAiParseInputFromFile(file: File, fallbackName: string): Promise<AiParseInput> {
  return { fileBase64: await fileToBase64(file), mimeType: file.type || 'application/pdf', fallbackName };
}

/** Builds the AI parse request body for a PDF, preferring embedded text over raw bytes to keep requests small and cheap. */
export async function buildAiParseInput(file: File, extractedText: string, fallbackName: string): Promise<AiParseInput> {
  return extractedText.trim()
    ? buildAiParseInputFromText(extractedText, fallbackName)
    : buildAiParseInputFromFile(file, fallbackName);
}

/**
 * Sends a PDF (as text or raw bytes) to the AI-assisted parsing Supabase
 * Edge Function. The caller's session JWT is attached automatically by the
 * Supabase client — callers must gate on `requireSession` first (see
 * `src/lib/supabase.ts`), since an unauthenticated invoke fails with a 401
 * rather than something this function should silently fall back on. Throws
 * if unconfigured, rate-limited, or the function fails — callers should
 * fall back to local parsing.
 */
export async function parseWithAiBackend(input: AiParseInput): Promise<ParsedPlan> {
  if (!supabase) {
    throw new Error('AI-assisted PDF import is not configured for this deployment.');
  }

  const { data, error, response } = await supabase.functions.invoke<ParsedPlan>('parse', { body: input });

  if (error) {
    if (response?.status === 429) {
      throw new Error("You've hit today's AI import limit — try again tomorrow, or export this plan as a Word doc or spreadsheet instead.");
    }
    if (response?.status === 401) {
      throw new Error('You need to sign in to use AI-assisted PDF import.');
    }
    throw new Error(`AI-assisted PDF import failed: ${error.message}`);
  }

  if (!data) {
    throw new Error('AI-assisted PDF import returned no data.');
  }

  return data;
}
