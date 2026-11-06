import { Router, type Request, type Response, type NextFunction } from 'express';
import type { AdminStore, User } from '../admin/store.ts';

const COOKIE = 'inodose_sid';

function getToken(req: Request): string | undefined {
  // Accept either a Bearer header (what the /api/v1 SPA sends) or the legacy
  // cookie (set by the older /api/auth/login flow).
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    const t = auth.slice(7).trim();
    if (t) return t;
  }
  const raw = req.headers.cookie;
  if (!raw) return;
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === COOKIE) return decodeURIComponent(v.join('='));
  }
}

export function requireAuth(store: AdminStore) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const u = await store.userFromSession(getToken(req));
    if (!u) return res.status(401).json({ error: 'Not authenticated' });
    (req as Request & { user: User }).user = u;
    next();
  };
}

export function requireAdminEdit(store: AdminStore) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const u = await store.userFromSession(getToken(req));
    if (!u) return res.status(401).json({ error: 'Not authenticated' });
    const role = await store.getRole(u.roleId);
    if (!role?.permissions.nav.administration.edit) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    (req as Request & { user: User }).user = u;
    next();
  };
}

export function authRouter(store: AdminStore) {
  const r = Router();

  r.post('/auth/login', async (req, res) => {
    const { username, password } = req.body ?? {};
    if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });
    const u = await store.verifyLogin(String(username), String(password));
    if (!u) return res.status(401).json({ error: 'Invalid username or password' });
    const token = await store.createSession(u.id);
    res.setHeader('Set-Cookie',
      `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 12}`);
    res.json({ ok: true });
  });

  r.post('/auth/logout', async (req, res) => {
    const t = getToken(req);
    if (t) await store.endSession(t);
    res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
    res.json({ ok: true });
  });

  r.get('/auth/me', async (req, res) => {
    const u = await store.userFromSession(getToken(req));
    if (!u) return res.status(401).json({ error: 'Not authenticated' });
    const role = await store.getRole(u.roleId);
    if (!role) return res.status(500).json({ error: 'Role missing' });
    res.json({
      user: u,
      roleName: role.name,
      permissions: role.permissions,
    });
  });

  return r;
}
