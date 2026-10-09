import express from 'express';
import type { Request, Response } from 'express';
import { parsePlanWithAI } from './claudeClient.js';
import { checkRateLimit } from './rateLimit.js';

const MAX_BODY_SIZE = '15mb'; // generous enough for a multi-page PDF, base64-inflated

export interface AppConfig {
  apiKey: string | undefined;
  allowedOrigin: string | undefined;
  freeParsesPerDay: number;
}

export function createApp(config: AppConfig) {
  const app = express();
  app.use(express.json({ limit: MAX_BODY_SIZE }));

  app.use((req: Request, res: Response, next) => {
    if (config.allowedOrigin) {
      res.setHeader('Access-Control-Allow-Origin', config.allowedOrigin);
      res.setHeader('Access-Control-Allow-Headers', 'content-type, x-device-id');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    }
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  app.post('/parse', async (req: Request, res: Response) => {
    if (!config.apiKey) {
      res.status(503).json({ error: 'AI parsing is not configured on this deployment.' });
      return;
    }

    const deviceId = req.header('x-device-id');
    const limiterKey = deviceId || req.ip || 'unknown';
    const rateLimit = checkRateLimit(limiterKey, config.freeParsesPerDay);
    if (!rateLimit.allowed) {
      res.status(429).json({ error: 'Daily AI-parsing limit reached. Try again tomorrow.', resetAt: rateLimit.resetAt });
      return;
    }

    const { text, fileBase64, mimeType, fallbackName } = req.body ?? {};
    if (typeof fallbackName !== 'string' || (!text && !fileBase64)) {
      res.status(400).json({ error: 'Request must include fallbackName and either text or fileBase64.' });
      return;
    }

    try {
      const plan = await parsePlanWithAI({ text, fileBase64, mimeType, fallbackName }, config.apiKey);
      res.json(plan);
    } catch (err) {
      console.error('parsePlanWithAI failed:', err);
      res.status(502).json({ error: 'AI parsing failed.' });
    }
  });

  return app;
}
