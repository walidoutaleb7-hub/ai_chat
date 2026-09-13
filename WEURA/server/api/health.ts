import express from 'express';

const router = express.Router();

router.get('/health', (_req, res) => {
  const grokConfigured = Boolean(
    process.env.GROK_API_KEY?.trim(),
  );

  const searchConfigured = Boolean(
    process.env.SEARCH_API_URL?.trim(),
  );

  const ready = grokConfigured;

  return res.status(ready ? 200 : 503).json({
    success: ready,
    service: 'WEURA AI',
    status: ready ? 'connected' : 'misconfigured',

    services: {
      grok: grokConfigured
        ? 'configured'
        : 'missing_api_key',

      search: searchConfigured
        ? 'configured'
        : 'not_configured',
    },

    server: {
      uptime: process.uptime(),
      environment:
        process.env.NODE_ENV ?? 'development',
    },

    timestamp: new Date().toISOString(),
  });
});

router.get('/status', (_req, res) => {
  return res.json({
    success: true,
    service: 'WEURA AI',
    tagline: 'Think Beyond.',
    status: 'online',

    provider: {
      name: 'xAI / Grok',
      configured: Boolean(
        process.env.GROK_API_KEY?.trim(),
      ),
    },

    tools: {
      search: Boolean(
        process.env.SEARCH_API_URL?.trim(),
      ),
      calculator: true,
      memory: true,
      files: true,
      vision: true,
    },

    timestamp: new Date().toISOString(),
  });
});

export default router;