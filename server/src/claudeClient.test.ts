import { afterEach, describe, expect, it, vi } from 'vitest';
import { parsePlanWithAI } from './claudeClient.js';

function mockAnthropicResponse(toolInput: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      content: [{ type: 'tool_use', name: 'submit_parsed_plan', input: toolInput }],
    }),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('parsePlanWithAI', () => {
  it('converts a well-formed tool response into a ParsedPlan', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockAnthropicResponse({
          name: 'Push Pull Legs',
          days: [
            {
              week: 1,
              label: 'Day 1: Push',
              groups: [{ type: 'superset', label: 'Superset A' }],
              exercises: [
                {
                  name: 'Bench Press',
                  targetSets: 4,
                  targetReps: '8',
                  targetWeight: '135',
                  targetTime: null,
                  targetRest: '90s',
                  notes: null,
                  groupIndex: 0,
                },
                {
                  name: 'Row',
                  targetSets: 4,
                  targetReps: '10',
                  targetWeight: null,
                  targetTime: null,
                  targetRest: null,
                  notes: null,
                  groupIndex: 0,
                },
                {
                  name: 'Plank',
                  targetSets: 3,
                  targetReps: null,
                  targetWeight: null,
                  targetTime: '45s',
                  targetRest: '30s',
                  notes: 'Keep core tight',
                  groupIndex: null,
                },
              ],
            },
          ],
        }),
      ),
    );

    const plan = await parsePlanWithAI({ text: 'some plan text', fallbackName: 'Fallback' }, 'fake-key');

    expect(plan.name).toBe('Push Pull Legs');
    expect(plan.days).toHaveLength(1);
    expect(plan.days[0].label).toBe('Day 1: Push');
    expect(plan.days[0].exercises).toHaveLength(3);
    expect(plan.days[0].groups).toHaveLength(1);

    // The two superset exercises should share the generated group tempId.
    const [bench, row, plank] = plan.days[0].exercises;
    const groupId = plan.days[0].groups[0].tempId;
    expect(bench.groupTempId).toBe(groupId);
    expect(row.groupTempId).toBe(groupId);
    expect(plank.groupTempId).toBeNull();
    expect(plank.targetTime).toBe('45s');
    expect(plank.notes).toBe('Keep core tight');
  });

  it('falls back to the provided name when the model omits one', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockAnthropicResponse({
          days: [{ week: 1, label: 'Day 1', groups: [], exercises: [{ name: 'Squat', targetSets: 3, targetReps: '10', targetWeight: null, targetTime: null, targetRest: null, notes: null, groupIndex: null }] }],
        }),
      ),
    );

    const plan = await parsePlanWithAI({ text: 'x', fallbackName: 'Fallback' }, 'fake-key', 'model');
    expect(plan.name).toBeDefined();
  });

  it('drops exercises with no name rather than keeping blanks', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockAnthropicResponse({
          name: 'Plan',
          days: [
            {
              week: 1,
              label: 'Day 1',
              groups: [],
              exercises: [
                { name: '', targetSets: 3, targetReps: '10', targetWeight: null, targetTime: null, targetRest: null, notes: null, groupIndex: null },
                { name: 'Squat', targetSets: 3, targetReps: '10', targetWeight: null, targetTime: null, targetRest: null, notes: null, groupIndex: null },
              ],
            },
          ],
        }),
      ),
    );

    const plan = await parsePlanWithAI({ text: 'x', fallbackName: 'Fallback' }, 'fake-key');
    expect(plan.days[0].exercises).toHaveLength(1);
    expect(plan.days[0].exercises[0].name).toBe('Squat');
  });

  it('throws when the response has no days, so the caller can fall back', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockAnthropicResponse({ name: 'Empty', days: [] })));
    await expect(parsePlanWithAI({ text: 'x', fallbackName: 'Fallback' }, 'fake-key')).rejects.toThrow();
  });

  it('throws when the HTTP response is not ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'invalid api key' }),
    );
    await expect(parsePlanWithAI({ text: 'x', fallbackName: 'Fallback' }, 'bad-key')).rejects.toThrow(/401/);
  });

  it('throws when neither text nor a file is provided', async () => {
    await expect(parsePlanWithAI({ fallbackName: 'x' }, 'fake-key')).rejects.toThrow();
  });
});
