import type { ParsedPlan } from './types';
import { getDeviceId } from '../lib/deviceId';

export function getParseApiUrl(): string | undefined {
  return import.meta.env.VITE_PARSE_API_URL as string | undefined;
}

export function isAiParseConfigured(): boolean {
  return Boolean(getParseApiUrl());
}

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

/** Builds the AI parse request body for a PDF, preferring embedded text over raw bytes to keep requests small and cheap. */
export async function buildAiParseInput(file: File, extractedText: string, fallbackName: string): Promise<AiParseInput> {
  if (extractedText.trim()) {
    return { text: extractedText, fallbackName };
  }
  return { fileBase64: await fileToBase64(file), mimeType: file.type || 'application/pdf', fallbackName };
}

/** Sends a PDF (as text or raw bytes) to the AI-assisted parsing backend. Throws if unconfigured, rate-limited, or the backend fails — callers should fall back to local parsing. */
export async function parseWithAiBackend(input: AiParseInput): Promise<ParsedPlan> {
  const baseUrl = getParseApiUrl();
  if (!baseUrl) {
    throw new Error('AI-assisted PDF import is not configured for this deployment.');
  }

  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/parse`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-device-id': getDeviceId(),
    },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    if (res.status === 429) {
      throw new Error("You've hit today's AI import limit — try again tomorrow, or export this plan as a Word doc or spreadsheet instead.");
    }
    throw new Error(`AI-assisted PDF import failed (status ${res.status}).`);
  }

  return (await res.json()) as ParsedPlan;
}
