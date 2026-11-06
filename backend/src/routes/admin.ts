import { Router } from 'express';
import type { AdminStore } from '../admin/store.ts';
import { requireAuth, requireAdminEdit } from './auth.ts';

export function adminRouter(store: AdminStore) {
  const r = Router();

  // Company
  r.get('/admin/company', requireAuth(store), async (_req, res) => res.json(await store.getCompany()));
  r.put('/admin/company', requireAdminEdit(store), async (req, res) => res.json(await store.setCompany(req.body)));

  // Roles
  r.get('/admin/roles', requireAuth(store), async (_req, res) => res.json(await store.listRoles()));
  r.post('/admin/roles', requireAdminEdit(store), async (req, res) => {
    try { res.status(201).json(await store.addRole(req.body)); }
    catch (e) { res.status(400).json({ error: (e as Error).message }); }
  });
  r.put('/admin/roles/:id', requireAdminEdit(store), async (req, res) => {
    const u = await store.updateRole(req.params.id, req.body);
    u ? res.json(u) : res.status(404).json({ error: 'Not found' });
  });
  r.put('/admin/roles/:id/permissions', requireAdminEdit(store), async (req, res) => {
    const u = await store.updateRolePermissions(req.params.id, req.body);
    u ? res.json(u) : res.status(404).json({ error: 'Not found' });
  });
  r.delete('/admin/roles/:id', requireAdminEdit(store), async (req, res) => {
    const out = await store.deleteRole(req.params.id);
    if (!out.ok) return res.status(409).json({ error: out.error });
    res.status(204).end();
  });

  // Users
  r.get('/admin/users', requireAuth(store), async (_req, res) => res.json(await store.listUsers()));
  r.post('/admin/users', requireAdminEdit(store), async (req, res) => {
    try { res.status(201).json(await store.addUser(req.body)); }
    catch (e) { res.status(400).json({ error: (e as Error).message }); }
  });
  r.put('/admin/users/:id', requireAdminEdit(store), async (req, res) => {
    const u = await store.updateUser(req.params.id, req.body);
    u ? res.json(u) : res.status(404).json({ error: 'Not found' });
  });
  r.delete('/admin/users/:id', requireAdminEdit(store), async (req, res) => {
    await store.deleteUser(req.params.id);
    res.status(204).end();
  });

  return r;
}
