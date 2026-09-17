import express from 'express';

const router = express.Router();

const startedAt = Date.now();

function activeProvider(): string {
  // Groq is PRIMARY. Cerebras is FALLBACK.
  if (process.env.GROQ_API_KEY?.trim()) return 'groq';
  if (process.env.CEREBRAS_API_KEY?.trim()) return 'cerebras';
  return 'none';
}

function uptimeLabel(): string {
  const seconds = Math.floor((Date.now() - startedAt) / 1000);
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);

  return parts.join(' ');
}

router.get('/health', (_req, res) => {
  const provider = activeProvider();

  const searchReady = Boolean(process.env.TAVILY_API_KEY?.trim());
  const imagesReady = Boolean(
    process.env.CLOUDFLARE_ACCOUNT_ID?.trim() &&
      process.env.CLOUDFLARE_API_TOKEN?.trim(),
  );

  const aiReady = provider !== 'none';
  const ready = aiReady;

  return res.status(ready ? 200 : 503).json({
    success: ready,
    service: 'WEURA AI',
    tagline: 'Think Beyond.',
    version: '1.0.0',
    status: ready ? 'connected' : 'misconfigured',

    services: {
      ai: aiReady ? 'configured' : 'missing_api_key',
      search: searchReady ? 'configured' : 'not_configured',
      images: imagesReady ? 'configured' : 'not_configured',
    },

    server: {
      uptime: uptimeLabel(),
      environment: process.env.NODE_ENV ?? 'production',
    },

    timestamp: new Date().toISOString(),
  });
});

router.get('/status', (_req, res) => {
  const provider = activeProvider();

  return res.json({
    success: true,
    service: 'WEURA AI',
    tagline: 'Think Beyond.',
    version: '1.0.0',
    status: 'online',

    provider: {
      name: provider,
      configured: provider !== 'none',
    },

    features: {
      chat: true,
      search: Boolean(process.env.TAVILY_API_KEY?.trim()),
      imageGeneration: Boolean(
        process.env.CLOUDFLARE_ACCOUNT_ID?.trim() &&
          process.env.CLOUDFLARE_API_TOKEN?.trim(),
      ),
      vision: provider !== 'none',
      players: true,
      files: true,
      voice: true,
    },

    timestamp: new Date().toISOString(),
  });
});

export default router;