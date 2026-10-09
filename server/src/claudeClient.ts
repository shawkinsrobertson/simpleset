import type { ParsedDay, ParsedExercise, ParsedGroup, ParsedPlan } from './types.js';

const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 8000;

export interface ParseInput {
  text?: string;
  fileBase64?: string;
  mimeType?: string;
  fallbackName: string;
}

// The shape the model is forced to emit, via tool_choice — this guarantees
// structured JSON instead of needing to coax/parse free-form text out of
// the model's reply. groupIndex (rather than a string id the model would
// have to invent and keep consistent) is just a position in this day's
// groups array — simpler for the model to get right, converted into a
// real tempId server-side once the response comes back.
const PARSE_TOOL = {
  name: 'submit_parsed_plan',
  description: 'Submit the workout plan extracted from the document.',
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'A short name for the overall plan.' },
      days: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            week: { type: 'integer', minimum: 1, description: 'Week number, starting at 1. Most plans are a single week (1) repeated.' },
            label: { type: 'string', description: 'e.g. "Day 1: Push", "Upper Body A".' },
            groups: {
              type: 'array',
              description: 'Circuits/supersets within this day, if any. Leave empty if the day has no grouped exercises.',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string', enum: ['circuit', 'superset'] },
                  label: { type: ['string', 'null'] },
                },
                required: ['type', 'label'],
              },
            },
            exercises: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  targetSets: { type: ['integer', 'null'] },
                  targetReps: { type: ['string', 'null'], description: 'Free-form, e.g. "8-10", "AMRAP". Null if this exercise is time-based instead.' },
                  targetWeight: { type: ['string', 'null'] },
                  targetTime: { type: ['string', 'null'], description: 'Free-form duration, e.g. "30s", "1min", for timed exercises (planks, holds). Null for rep-based exercises.' },
                  targetRest: { type: ['string', 'null'], description: 'Free-form, e.g. "60s", "90s".' },
                  notes: { type: ['string', 'null'] },
                  groupIndex: { type: ['integer', 'null'], description: "Index into this day's groups array if part of a circuit/superset, else null." },
                },
                required: ['name', 'targetSets', 'targetReps', 'targetWeight', 'targetTime', 'targetRest', 'notes', 'groupIndex'],
              },
            },
          },
          required: ['week', 'label', 'groups', 'exercises'],
        },
      },
    },
    required: ['name', 'days'],
  },
};

const SYSTEM_PROMPT = `You extract structured workout plan data from documents (which may be clean text, a well-formatted PDF, or a scanned/photographed page). Read the whole document and call submit_parsed_plan with every training day you find. Preserve the structure already present in the document (sets/reps/weight/rest, circuits/supersets, week numbers) rather than inventing values that aren't there — use null for anything not specified. Ignore non-workout content (intros, nutrition advice, cover pages).`;

interface AnthropicContentBlock {
  type: string;
  input?: unknown;
}

interface AnthropicResponse {
  content: AnthropicContentBlock[];
  stop_reason?: string;
}

async function callClaude(input: ParseInput, apiKey: string, model: string): Promise<unknown> {
  const contentBlocks: unknown[] = [];
  if (input.fileBase64 && input.mimeType) {
    const blockType = input.mimeType.startsWith('image/') ? 'image' : 'document';
    contentBlocks.push({
      type: blockType,
      source: { type: 'base64', media_type: input.mimeType, data: input.fileBase64 },
    });
  }
  if (input.text) {
    contentBlocks.push({ type: 'text', text: input.text });
  }
  if (contentBlocks.length === 0) {
    throw new Error('parseWithAI requires either text or a file to parse.');
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: contentBlocks }],
      tools: [PARSE_TOOL],
      tool_choice: { type: 'tool', name: PARSE_TOOL.name },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Anthropic API error (${res.status}): ${body.slice(0, 500)}`);
  }

  const data = (await res.json()) as AnthropicResponse;
  const toolUse = data.content.find((block) => block.type === 'tool_use');
  if (!toolUse || typeof toolUse.input !== 'object' || toolUse.input === null) {
    throw new Error('Anthropic response did not include the expected tool call.');
  }
  return toolUse.input;
}

/** Narrow + coerce a free-form value into the nullable-string/number shapes our types expect. */
function asNullableString(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null;
}
function asNullableInt(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v);
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Math.round(Number(v));
  return null;
}

function toParsedPlan(raw: unknown, fallbackName: string): ParsedPlan {
  if (typeof raw !== 'object' || raw === null) throw new Error('Malformed AI response: not an object.');
  const obj = raw as Record<string, unknown>;
  const rawDays = Array.isArray(obj.days) ? obj.days : [];
  if (rawDays.length === 0) throw new Error('Malformed AI response: no days found.');

  const days: ParsedDay[] = rawDays.map((rawDay) => {
    const day = (rawDay ?? {}) as Record<string, unknown>;
    const rawGroups = Array.isArray(day.groups) ? day.groups : [];
    const groups: ParsedGroup[] = rawGroups.map((rawGroup) => {
      const g = (rawGroup ?? {}) as Record<string, unknown>;
      const type = g.type === 'superset' ? 'superset' : 'circuit';
      return { tempId: crypto.randomUUID(), type, label: asNullableString(g.label) };
    });

    const rawExercises = Array.isArray(day.exercises) ? day.exercises : [];
    const exercises: ParsedExercise[] = rawExercises
      .map((rawEx) => {
        const e = (rawEx ?? {}) as Record<string, unknown>;
        const name = typeof e.name === 'string' ? e.name.trim() : '';
        if (!name) return null;
        const groupIndex = asNullableInt(e.groupIndex);
        const group = groupIndex != null ? groups[groupIndex] : undefined;
        const exercise: ParsedExercise = {
          tempId: crypto.randomUUID(),
          name,
          targetSets: asNullableInt(e.targetSets),
          targetReps: asNullableString(e.targetReps),
          targetWeight: asNullableString(e.targetWeight),
          targetTime: asNullableString(e.targetTime),
          targetRest: asNullableString(e.targetRest),
          notes: asNullableString(e.notes),
          groupTempId: group?.tempId ?? null,
          raw: '',
        };
        return exercise;
      })
      .filter((e): e is ParsedExercise => e !== null);

    return {
      tempId: crypto.randomUUID(),
      week: asNullableInt(day.week) ?? 1,
      label: typeof day.label === 'string' && day.label.trim() ? day.label.trim() : 'New Day',
      exercises,
      groups,
    };
  });

  const name = typeof obj.name === 'string' && obj.name.trim() ? obj.name.trim() : fallbackName;
  return { name, days, warnings: [] };
}

/** Parses a document (text or file) into a ParsedPlan via Claude's Messages API. */
export async function parsePlanWithAI(input: ParseInput, apiKey: string, model = DEFAULT_MODEL): Promise<ParsedPlan> {
  const raw = await callClaude(input, apiKey, model);
  return toParsedPlan(raw, input.fallbackName);
}
