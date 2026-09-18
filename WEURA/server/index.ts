import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import chatRouter from './api/chat';
import searchRouter from './api/search';
import healthRouter from './api/health';
import imageRouter from './api/image';
import visionRouter from './api/vision';
import playerRouter from './api/player';
import filesRouter from './api/files';
import footballRouter from './api/football';   // ← جديد

import { rateLimit, requestId } from './api/security_middleware';

const app = express();

const PORT = Number(process.env.PORT) || 8080;
const HOST = '0.0.0.0';

app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=()');
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

app.use((req, res, next) => {
  req.setTimeout(5 * 60 * 1000);
  res.setTimeout(5 * 60 * 1000);
  res.setHeader('Connection', 'keep-alive');
  next();
});

app.use(express.json({ limit: '15mb' }));
app.use(requestId);

app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - startedAt;
    const id = (res.locals.requestId as string | undefined) ?? '-';
    console.log(
      `[WEURA][${id}] ${req.method} ${req.originalUrl} ` +
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
app.use('/api', rateLimit);

app.use('/api', chatRouter);
app.use('/api', searchRouter);
app.use('/api', imageRouter);
app.use('/api', visionRouter);
app.use('/api', playerRouter);
app.use('/api', filesRouter);
app.use('/api', footballRouter);   // ← جديد

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
    const id = (res.locals.requestId as string | undefined) ?? '-';
    console.error(`[WEURA][${id}] Unhandled error:`, error);
    if (res.headersSent) return;
    res.status(500).json({
      success: false,
      error: 'Internal server error.',
      requestId: id,
    });
  },
);

const server = app.listen(PORT, HOST, () => {
  const groqReady = Boolean(process.env.GROQ_API_KEY?.trim());
  const cerebrasReady = Boolean(process.env.CEREBRAS_API_KEY?.trim());
  const tavilyReady = Boolean(process.env.TAVILY_API_KEY?.trim());
  const cfReady = Boolean(
    process.env.CLOUDFLARE_ACCOUNT_ID?.trim() &&
      process.env.CLOUDFLARE_API_TOKEN?.trim(),
  );
  const sportReady = Boolean(process.env.SPORTAPI_KEY?.trim());

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('          WEURA AI');
  console.log('          Think Beyond.');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Bind:        ${HOST}:${PORT}`);
  console.log(`Health:      /health`);
  console.log(`Groq:        ${groqReady ? 'READY (primary)' : 'MISSING'}`);
  console.log(`Cerebras:    ${cerebrasReady ? 'READY (fallback)' : 'MISSING'}`);
  console.log(`Tavily:      ${tavilyReady ? 'READY' : 'MISSING'}`);
  console.log(`Cloudflare:  ${cfReady ? 'READY' : 'MISSING'}`);
  console.log(`SportAPI:    ${sportReady ? 'READY' : 'MISSING'}`);
  console.log(`Vision:      ${groqReady ? 'READY' : 'MISSING'}`);
  console.log(`Players:     READY`);
  console.log(`Files:       READY`);
  console.log(`Football:    READY`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
});

server.requestTimeout = 0;
server.headersTimeout = 5 * 60 * 1000;
server.keepAliveTimeout = 65 * 1000;

server.on('error', (error) => {
  console.error('[WEURA] Server error:', error);
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});