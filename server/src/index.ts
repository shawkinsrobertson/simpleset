import { createApp } from './app.js';

const PORT = Number(process.env.PORT) || 8787;

const app = createApp({
  apiKey: process.env.ANTHROPIC_API_KEY,
  allowedOrigin: process.env.ALLOWED_ORIGIN,
  freeParsesPerDay: Number(process.env.FREE_PARSES_PER_DAY) || 10,
});

app.listen(PORT, () => {
  console.log(`simpleset-server listening on :${PORT}`);
});
