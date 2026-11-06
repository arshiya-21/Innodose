/**
 * Inodose mock API server — the same handlers as the in-browser mock, served over HTTP
 * so backend developers can see the exact request/response contract.
 *
 *   npm run dev:api            → http://localhost:4000/api/v1
 *   (then set VITE_USE_MOCK=false and run `npm run dev`; Vite proxies /api to this server)
 *
 * Replace this server with the real backend; keep the paths and JSON shapes in docs/API.md.
 */
import express from 'express';
import { dispatch } from '../src/api/mock/router';

const PORT = Number(process.env.PORT || 4000);
const BASE = '/api/v1';
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));

app.use(BASE, (req, res) => {
  const auth = req.header('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const body = req.method === 'GET' ? undefined : req.body;
  const r = dispatch(req.method, req.url, body, token);
  res.status(r.status);
  if (r.body === null || r.body === undefined) res.end();
  else res.json(r.body);
});

app.listen(PORT, () => console.log(`Inodose mock API listening on http://localhost:${PORT}${BASE}`));
