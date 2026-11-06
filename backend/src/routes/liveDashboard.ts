import { Router } from 'express';
import type { DataStore } from '../db.ts';

export function liveDashboardRouter(store: DataStore) {
  const r = Router();

  r.get('/live/snapshot', async (_req, res, next) => {
    try {
      res.json(await store.liveSnapshot());
    } catch (e) { next(e); }
  });

  return r;
}
