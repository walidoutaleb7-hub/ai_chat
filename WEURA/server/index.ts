import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import chatRouter from './api/chat';
import searchRouter from './api/search';

const app = express();

const PORT = Number(process.env.PORT) || 8080;

const hasGrokKey = Boolean(
  process.env.GROK_API_KEY?.trim(),
);

const hasSearchProvider = Boolean(
  process.env.SEARCH_API_URL?.trim(),
);

// ─────────────────────────────────────────────
// Security
// ─────────────────────────────────────────────

app.disable('x-powered-by');

app.use((req, res, next) => {
  res.setHeader(
    'X-Content-Type-Options',
    'nosniff',
  );

  res.setHeader(
    'X-Frame-Options',
    'DENY',
  );

  res.setHeader(
    'Referrer-Policy',
    'no-referrer',
  );

  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=()',
  );

  next();
});

// ─────────────────────────────────────────────
// CORS
// ─────────────────────────────────────────────

app.use(
  cors({
    origin: true,
    credentials: true,
    methods: [
      'GET',
      'POST',
      'OPTIONS',
    ],
    allowedHeaders: [
      'Content-Type',
      'Accept',
    ],
  }),
);

// ─────────────────────────────────────────────
// Body Parser
// ─────────────────────────────────────────────

app.use(
  express.json({
    limit: '10mb',
  }),
);

// ─────────────────────────────────────────────
// Request Logging
// ─────────────────────────────────────────────

app.use((req, _res, next) => {
  const startedAt = Date.now();

  _res.on('finish', () => {
    const duration = Date.now() - startedAt;

    console.log(
      `[WEURA] ${req.method} ${req.originalUrl} ` +
      `${_res.statusCode} ${duration}ms`,
    );
  });

  next();
});

// ─────────────────────────────────────────────
// Root
// ─────────────────────────────────────────────

app.get('/', (_req, res) => {
  res.json({
    success: true,
    name: 'WEURA AI',
    tagline: 'Think Beyond.',
    status: 'online',
    version: '1.0.0',
  });
});

// ─────────────────────────────────────────────
// Health
// ─────────────────────────────────────────────

app.get('/health', (_req, res) => {
  const ready = hasGrokKey;

  res.status(ready ? 200 : 503).json({
    success: ready,
    name: 'WEURA AI',
    status: ready
        ? 'connected'
        : 'misconfigured',

    services: {
      grok: hasGrokKey
          ? 'configured'
          : 'missing_api_key',

      search: hasSearchProvider
          ? 'configured'
          : 'not_configured',
    },

    timestamp: new Date().toISOString(),

    uptime: process.uptime(),
  });
});

// ─────────────────────────────────────────────
// API Status
// ─────────────────────────────────────────────

app.get('/api/status', (_req, res) => {
  res.json({
    success: true,

    service: 'WEURA AI',

    status: 'online',

    provider: {
      name: 'xAI / Grok',
      configured: hasGrokKey,
    },

    tools: {
      search: hasSearchProvider,
      calculator: true,
      memory: true,
      files: true,
      vision: true,
    },

    server: {
      uptime: process.uptime(),
      environment:
        process.env.NODE_ENV ||
        'development',
    },

    timestamp: new Date().toISOString(),
  });
});

// ─────────────────────────────────────────────
// AI API
// ─────────────────────────────────────────────

app.use(
  '/api',
  chatRouter,
);

// ─────────────────────────────────────────────
// Search API
// ─────────────────────────────────────────────

app.use(
  '/api',
  searchRouter,
);

// ─────────────────────────────────────────────
// 404
// ─────────────────────────────────────────────

app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found.',
  });
});

// ─────────────────────────────────────────────
// Global Error Handler
// ─────────────────────────────────────────────

app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error(
      '[WEURA] Unhandled error:',
      error,
    );

    if (res.headersSent) {
      return;
    }

    res.status(500).json({
      success: false,
      error: 'Internal server error.',
    });
  },
);

// ─────────────────────────────────────────────
// Start
// ─────────────────────────────────────────────

app.listen(PORT, () => {
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('       WEURA AI');
  console.log('       Think Beyond.');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(
    `Server: http://localhost:${PORT}`,
  );
  console.log(
    `Health: http://localhost:${PORT}/health`,
  );
  console.log(
    `Status: http://localhost:${PORT}/api/status`,
  );
  console.log(
    `Grok: ${hasGrokKey ? 'READY' : 'MISSING'}`,
  );
  console.log(
    `Search: ${
      hasSearchProvider
        ? 'READY'
        : 'NOT CONFIGURED'
    }`,
  );
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
});