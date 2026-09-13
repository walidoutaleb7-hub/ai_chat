import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import chatRouter from './api/chat';
import searchRouter from './api/search';
import healthRouter from './api/health';

const app = express();

const PORT = Number(process.env.PORT) || 8080;

app.disable('x-powered-by');

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=()',
  );

  next();
});

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

app.use((req, res, next) => {
  const startedAt = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - startedAt;

    console.log(
      `[WEURA] ${req.method} ${req.originalUrl} ` +
        `${res.statusCode} ${duration}ms`,
    );
  });

  next();
});

app.get('/', (_req, res) => {
  res.json({
    success: true,
    name: 'WEURA AI',
    tagline: 'Think Beyond.',
    status: 'online',
    version: '1.0.0',
  });
});

app.use(healthRouter);

app.use('/api', chatRouter);
app.use('/api', searchRouter);

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
    console.error('[WEURA] Unhandled error:', error);

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
  const grokReady = Boolean(
    process.env.GROK_API_KEY?.trim(),
  );

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('          WEURA AI');
  console.log('          Think Beyond.');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Server: http://localhost:${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);
  console.log(`Status: http://localhost:${PORT}/status`);
  console.log(
    `Grok: ${grokReady ? 'READY' : 'MISSING'}`,
  );
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
});