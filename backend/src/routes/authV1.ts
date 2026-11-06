/**
 * /api/v1/auth adapter for the React frontend.
 * Contract matches src/api/types.ts in frontend:
 *   POST /auth/login   { userId, password, staySignedIn } -> { token, expiresAt, user }
 *   GET  /auth/me                                          -> user
 *   POST /auth/logout
 *
 * Token is returned in the response body (frontend stores it in session- or
 * localStorage per staySignedIn) and sent back as `Authorization: Bearer <t>`.
 * Internally it reuses the same session store as the cookie-based /auth routes.
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { createHash } from 'node:crypto';
import mysql from 'mysql2/promise';
import type { AdminStore, User } from '../admin/store.ts';
import type { Action, ControlMode, NavKey } from '../admin/types.ts';
import { log, type Logger } from '../lib/logger.ts';

function bearer(req: Request): string | undefined {
  const h = req.headers.authorization;
  if (!h) return;
  const [scheme, token] = h.split(' ');
  return scheme === 'Bearer' && token ? token : undefined;
}

function roleName(name: string | undefined): 'Operator' | 'Supervisor' | 'Administrator' {
  if (!name) return 'Operator';
  const n = name.toLowerCase();
  if (n.startsWith('admin'))      return 'Administrator';
  if (n.startsWith('supervisor')) return 'Supervisor';
  return 'Operator';
}

function initialsOf(fullName: string) {
  return fullName.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join('');
}

async function userShape(store: AdminStore, u: User) {
  const r = await store.getRole(u.roleId);
  return {
    userId: u.username,
    name: u.fullName,
    role: roleName(r?.name),
    initials: initialsOf(u.fullName),
    // The UI shows pages and controls from these (same data the API enforces below).
    permissions: r?.permissions,
  };
}

export function authV1Router(store: AdminStore) {
  const r = Router();

  r.post('/auth/login', async (req, res) => {
    const { userId, password, staySignedIn } = req.body ?? {};
    if (!userId || !password) {
      log.warn(`login attempt rejected (no credentials from ${req.ip ?? '?'})`);
      return res.status(400).json({ message: 'Missing credentials' });
    }
    const u = await store.verifyLogin(String(userId), String(password));
    if (!u) {
      log.warn(`[${userId}] login failed`);
      return res.status(401).json({ message: 'Invalid user ID or password' });
    }
    // "Stay Signed In" really stays signed in (30 days); otherwise a normal 12 h working session.
    const hours = staySignedIn ? 24 * 30 : 12;
    const token = await store.createSession(u.id, hours);
    log.child(u.username).info(`login ok (stay=${!!staySignedIn})`);
    res.json({
      token,
      expiresAt: new Date(Date.now() + hours * 3600_000).toISOString(),
      user: await userShape(store, u),
    });
  });

  r.get('/auth/me', async (req, res) => {
    const u = await store.userFromSession(bearer(req));
    if (!u) return res.status(401).json({ message: 'Not authenticated' });
    res.json(await userShape(store, u));
  });

  r.post('/auth/logout', async (req, res) => {
    const t = bearer(req);
    const u = await store.userFromSession(t);
    if (t) await store.endSession(t);
    if (u) log.child(u.username).info('logout');
    res.status(204).end();
  });

  // Change password. Requires a valid bearer token + the current password.
  r.put('/auth/password', async (req, res) => {
    const u = await store.userFromSession(bearer(req));
    if (!u) return res.status(401).json({ message: 'Not authenticated' });
    const { currentPassword, newPassword } = req.body ?? {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'currentPassword and newPassword are required.' });
    }
    if (typeof newPassword !== 'string' || newPassword.length < 4) {
      return res.status(400).json({ message: 'New password must be at least 4 characters.' });
    }
    // Verify the current password by trying a fresh login
    const ok = await store.verifyLogin(u.username, String(currentPassword));
    if (!ok) return res.status(401).json({ message: 'Current password is wrong.' });

    if ((process.env.ADMIN_DRIVER ?? 'memory') !== 'mysql') {
      // In-memory store exposes no password setter publicly; the simplest path is
      // to update through updateUser when the driver supports it.
      return res.status(503).json({ message: 'Password change needs the MySQL driver.' });
    }
    const pool = mysql.createPool({
      host: process.env.MYSQL_HOST ?? 'localhost',
      port: Number(process.env.MYSQL_PORT ?? 3306),
      user: process.env.MYSQL_USER ?? 'root',
      password: process.env.MYSQL_PASSWORD ?? '',
      database: process.env.MYSQL_DATABASE ?? 'inodose_test',
    });
    try {
      const hash = createHash('sha256').update(String(newPassword)).digest('hex');
      await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, u.id]);
      res.status(204).end();
    } catch (e) {
      res.status(500).json({ message: (e as Error).message });
    } finally {
      await pool.end();
    }
  });

  return r;
}

/** Guard middleware for other /api/v1 routes that need a signed-in user.
 *  Also attaches a per-user child logger as `req.log`. */
export function requireAuthV1(store: AdminStore) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const u = await store.userFromSession(bearer(req));
    if (!u) return res.status(401).json({ message: 'Not authenticated' });
    (req as Request & { user: User; log: Logger }).user = u;
    (req as Request & { user: User; log: Logger }).log = log.child(u.username);
    next();
  };
}

/**
 * Guard: the signed-in user's ROLE PERMISSIONS (Administration → Permissions) must allow
 * `action` on the page `nav`, and — when `mode` is given — on that control mode too.
 * Use after requireAuthV1. 403 otherwise.
 */
export function requirePerm(store: AdminStore, nav: NavKey, action: Action, mode?: ControlMode | ((req: Request) => ControlMode | undefined)) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const u = (req as Request & { user?: User }).user ?? (await store.userFromSession(bearer(req)));
    if (!u) return res.status(401).json({ message: 'Not authenticated' });
    const role = await store.getRole(u.roleId);
    const p = role?.permissions;
    const m = typeof mode === 'function' ? mode(req) : mode;
    const ok = !!p?.nav?.[nav]?.[action] && (!m || !!p.controlModes?.[m]?.[action]);
    if (!ok) return res.status(403).json({ message: `Your role does not have ${action} access to ${m ? `${m} mode / ` : ''}${nav}.` });
    next();
  };
}
