import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import chatRouter from './api/chat';

const app = express();
const PORT = Number(process.env.PORT) || 8080;

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.use(express.json({ limit: '10mb' }));

app.get('/health', (_req, res) => {
  res.json({
    success: true,
    name: 'WEURA AI',
    status: 'connected',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api', chatRouter);

app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found.',
  });
});

app.listen(PORT, () => {
  console.log(`WEURA AI server running on port ${PORT}`);
});