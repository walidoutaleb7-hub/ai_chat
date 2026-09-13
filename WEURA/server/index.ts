import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import chatRouter from './api/chat';

const app = express();

const PORT = Number(process.env.PORT) || 8080;

app.disable('x-powered-by');

app.use(
  cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept'],
  }),
);

app.use(
  express.json({
    limit: '10mb',
  }),
);

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=()',
  );

  next();
});

app.get('/health', (_req, res) => {
  const configured = Boolean(
    process.env.GROK_API_KEY?.trim(),
  );

  res.status(configured ? 200 : 503).json({
    success: configured,
    name: 'WEURA AI',
    status: configured ? 'connected' : 'misconfigured',
    grok: configured ? 'configured' : 'missing_api_key',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/status', (_req, res) => {
  res.json({
    success: true,
    service: 'WEURA AI',
    ai: {
      provider: 'xAI / Grok',
      configured: Boolean(
        process.env.GROK_API_KEY?.trim(),
      ),
    },
    server: {
      status: 'online',
      uptime: process.uptime(),
    },
  });
});

app.use('/api', chatRouter);

app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found.',
  });
});

app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error('[WEURA] Unhandled server error:', error);

    if (res.headersSent) {
      return;
    }

    res.status(500).json({
      success: false,
      error: 'Internal server error.',
    });
  },
);

app.listen(PORT, () => {
  console.log(
    `[WEURA] Server running on port ${PORT}`,
  );
  console.log(
    `[WEURA] Health: http://localhost:${PORT}/health`,
  );
});