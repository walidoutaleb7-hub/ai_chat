import express from 'express';

const router = express.Router();

function activeProvider(): string {
  if (process.env.CEREBRAS_API_KEY?.trim()) return 'cerebras';
  if (process.env.GROQ_API_KEY?.trim()) return 'groq';
  return 'none';
}

router.get('/health', (_req, res) => {
  const provider = activeProvider();

  const searchConfigured = Boolean(
    process.env.TAVILY_API_KEY?.trim(),
  );

  const ready = provider !== 'none';

  return res.status(ready ? 200 : 503).json({
    success: ready,
    service: 'WEURA AI',
    status: ready ? 'connected' : 'misconfigured',

    services: {
      ai: provider === 'none' ? 'missing_api_key' : `configured (${provider})`,
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
  const provider = activeProvider();

  return res.json({
    success: true,
    service: 'WEURA AI',
    tagline: 'Think Beyond.',
    status: 'online',

    provider: {
      name: provider,
      configured: provider !== 'none',
    },

    tools: {
      search: Boolean(
        process.env.TAVILY_API_KEY?.trim(),
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
