import 'dotenv/config';
import {aiRoutes} from './ai/routes.js';
import express from 'express';
import {fileURLToPath} from 'node:url';
import {frontendRoutes} from './http/frontend.js';
import {runtimeConfig} from './http/config.js';
import {sessionMiddleware} from './http/session.js';
import { database, matchRoutes } from './db/routes.js';

const app = express();
const runtime=runtimeConfig();
const port = Number(process.env.PORT ?? 3002);
const host = process.env.HOST ?? '127.0.0.1';

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}

app.disable('x-powered-by');
app.use((_req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','same-origin');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");next();});
app.use(express.json({ limit: '1mb',inflate:false }));
app.use('/api',sessionMiddleware(runtime.secret,runtime.production));
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'matchlens-api' });
});
app.get('/api/ready',async(_req,res)=>{try{await database.query('SELECT 1');res.json({status:'ready'});}catch{res.status(503).json({status:'unavailable'});}});

// This route exposes local readiness only; it never sends a model request or returns credentials.
app.use('/api',aiRoutes(database));
app.use('/api/matches', matchRoutes);
app.use('/api',(_req,res)=>res.status(404).json({error:'API route not found'}));
if(process.env.NODE_ENV==='production')app.use(frontendRoutes(fileURLToPath(new URL('../../frontend/dist/',import.meta.url))));
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status=(error as {status?:number})?.status;
  if(status===400||status===413||status===415){res.status(status).json({error:status===413?'Request too large':status===415?'Unsupported request encoding':'Invalid JSON'});return;}
  console.error('Request failed');res.status(500).json({ error: 'Unable to complete request' });
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
