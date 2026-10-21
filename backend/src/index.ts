import 'dotenv/config';
import {aiRoutes} from './ai/routes.js';
import express from 'express';
import { database, matchRoutes } from './db/routes.js';

const app = express();
const port = Number(process.env.PORT ?? 3002);
const host = process.env.HOST ?? '127.0.0.1';

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'matchlens-api' });
});

// This route exposes local readiness only; it never sends a model request or returns credentials.
app.use('/api',aiRoutes(database));
app.use('/api/matches', matchRoutes);
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error instanceof Error ? error.message : 'Request failed');
  res.status(500).json({ error: 'Unable to complete request' });
});

const server = app.listen(port, host, () => {
  console.log(`MatchLens API listening on http://${host}:${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => { void database.end().then(() => process.exit(0)); });
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
