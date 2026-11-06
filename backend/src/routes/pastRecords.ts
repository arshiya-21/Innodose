import { Router } from 'express';
import type { DataStore } from '../db.ts';

export function pastRecordsRouter(store: DataStore) {
  const r = Router();

  // GET /api/past-records?from=2026-09-05&to=2026-10-05&component=All&machine=All
  r.get('/past-records', async (req, res, next) => {
    try {
      const { from = '', to = '', component, machine } = req.query as Record<string, string | undefined>;
      const data = await store.listPastRecords(
        from, to,
        component === 'All' ? undefined : component,
        machine === 'All' ? undefined : machine,
      );
      res.json({ data });
    } catch (e) { next(e); }
  });

  return r;
}
