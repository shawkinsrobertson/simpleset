import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';

vi.mock('./claudeClient.js', () => ({
  parsePlanWithAI: vi.fn(),
}));

import { parsePlanWithAI } from './claudeClient.js';

afterEach(() => {
  vi.resetAllMocks();
});

describe('POST /parse', () => {
  it('returns 503 when no API key is configured', async () => {
    const app = createApp({ apiKey: undefined, allowedOrigin: undefined, freeParsesPerDay: 10 });
    const res = await request(app).post('/parse').send({ text: 'x', fallbackName: 'Plan' });
    expect(res.status).toBe(503);
  });

  it('returns 400 when the request has neither text nor a file', async () => {
    const app = createApp({ apiKey: 'key', allowedOrigin: undefined, freeParsesPerDay: 10 });
    const res = await request(app).post('/parse').send({ fallbackName: 'Plan' });
    expect(res.status).toBe(400);
  });

  it('returns the parsed plan on success', async () => {
    const fakePlan = { name: 'My Plan', days: [], warnings: [] };
    vi.mocked(parsePlanWithAI).mockResolvedValue(fakePlan);
    const app = createApp({ apiKey: 'key', allowedOrigin: undefined, freeParsesPerDay: 10 });
    const res = await request(app)
      .post('/parse')
      .set('x-device-id', `device-${crypto.randomUUID()}`)
      .send({ text: 'some document text', fallbackName: 'Plan' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual(fakePlan);
  });

  it('returns 502 when parsing fails, so the client falls back locally', async () => {
    vi.mocked(parsePlanWithAI).mockRejectedValue(new Error('boom'));
    const app = createApp({ apiKey: 'key', allowedOrigin: undefined, freeParsesPerDay: 10 });
    const res = await request(app)
      .post('/parse')
      .set('x-device-id', `device-${crypto.randomUUID()}`)
      .send({ text: 'x', fallbackName: 'Plan' });
    expect(res.status).toBe(502);
  });

  it('rate-limits a device id after it exceeds the daily allowance', async () => {
    vi.mocked(parsePlanWithAI).mockResolvedValue({ name: 'Plan', days: [], warnings: [] });
    const app = createApp({ apiKey: 'key', allowedOrigin: undefined, freeParsesPerDay: 2 });
    const deviceId = `device-${crypto.randomUUID()}`;

    const first = await request(app).post('/parse').set('x-device-id', deviceId).send({ text: 'x', fallbackName: 'Plan' });
    const second = await request(app).post('/parse').set('x-device-id', deviceId).send({ text: 'x', fallbackName: 'Plan' });
    const third = await request(app).post('/parse').set('x-device-id', deviceId).send({ text: 'x', fallbackName: 'Plan' });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(third.status).toBe(429);
  });
});

describe('GET /health', () => {
  it('responds ok', async () => {
    const app = createApp({ apiKey: undefined, allowedOrigin: undefined, freeParsesPerDay: 10 });
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
