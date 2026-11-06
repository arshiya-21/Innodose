import { createHash, randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql, { type Pool, type RowDataPacket } from 'mysql2/promise';
import {
  type AdminStore, type CompanyInfo, type Permissions, type Role, type User,
  NAV, MODES, perms,
} from './types.ts';
import { log } from '../lib/logger.ts';

const adminLog = log.child('admin');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const hashPw = (pw: string) => createHash('sha256').update(pw).digest('hex');

interface UserRow extends RowDataPacket {
  id: string; username: string; password_hash: string; full_name: string;
  email: string; role_id: string; active: 0 | 1;
}
interface RoleRow extends RowDataPacket {
  role_id: string; name: string; description: string; perms_json: string | Permissions;
}
interface CompanyRow extends RowDataPacket {
  name: string; address: string; phone: string; email: string;
  gstin: string; logo_data_url: string;
}

function userFromRow(r: UserRow): User {
  return {
    id: r.id, username: r.username, fullName: r.full_name, email: r.email,
    roleId: r.role_id, active: !!r.active,
  };
}
function roleFromRow(r: RoleRow): Role {
  const permissions: Permissions = typeof r.perms_json === 'string' ? JSON.parse(r.perms_json) : r.perms_json;
  return { id: r.role_id, name: r.name, description: r.description, permissions };
}

export async function makeMysqlStore(): Promise<AdminStore> {
  const pool: Pool = mysql.createPool({
    host: process.env.MYSQL_HOST ?? 'localhost',
    port: Number(process.env.MYSQL_PORT ?? 3306),
    user: process.env.MYSQL_USER ?? 'root',
    password: process.env.MYSQL_PASSWORD ?? '',
    database: process.env.MYSQL_DATABASE ?? 'inodose_test',
    waitForConnections: true, connectionLimit: 10,
    multipleStatements: true,
  });

  // Run every .sql file in migrations/ in order (001_, 002_, …).
  const migrationsDir = process.env.INODOSE_HOME ? path.join(process.env.INODOSE_HOME, 'migrations') : path.resolve(__dirname, '..', '..', 'migrations');
  const files = (await readdir(migrationsDir))
    .filter(f => f.endsWith('.sql'))
    .sort();
  const t0 = Date.now();

  // Each migration runs ONCE and is recorded. Before, every file re-ran on every backend start, so deleted seed
  // rows (machines, alert recipients, shifts) came back and `DROP TABLE components` wiped edits.
  await pool.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       name       VARCHAR(255) NOT NULL PRIMARY KEY,
       applied_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
     ) ENGINE=InnoDB`,
  );
  const [doneRows] = await pool.query<RowDataPacket[]>('SELECT name FROM schema_migrations');
  const done = new Set(doneRows.map((r) => String(r.name)));
  if (done.size === 0) {
    // Database from before tracking existed: its schema and data are already there, so mark the old files as
    // applied WITHOUT re-running them (that would re-seed whatever was deleted). Newer files still run.
    const [existing] = await pool.query<RowDataPacket[]>(
      "SELECT 1 AS x FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'users' LIMIT 1",
    );
    if (existing.length) {
      for (const f of files.filter((n) => n < '016')) {
        await pool.query('INSERT IGNORE INTO schema_migrations (name) VALUES (?)', [f]);
        done.add(f);
      }
    }
  }
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = await readFile(path.join(migrationsDir, f), 'utf8');
    try {
      await pool.query(sql);
      await pool.query('INSERT INTO schema_migrations (name) VALUES (?)', [f]);
    } catch (e) {
      adminLog.error(`migration failed: ${f} — ${(e as Error).message}`);
      throw e;
    }
  }
  await seedIfEmpty(pool);
  const db = process.env.MYSQL_DATABASE ?? 'inodose_test';
  const host = process.env.MYSQL_HOST ?? 'localhost';
  adminLog.info(`${files.length} migration${files.length === 1 ? '' : 's'} applied in ${Date.now() - t0}ms (${db}@${host})`);

  // Sessions are persisted to MySQL so dev reloads / backend restarts don't
  // log everyone out. A single sweep at startup removes expired rows.
  const SESSION_HOURS = 12;
  await pool.query('DELETE FROM sessions WHERE expires_at <= NOW()');

  return {
    async verifyLogin(username, password) {
      // Username match is case-insensitive; password stays case-sensitive.
      const [rows] = await pool.query<UserRow[]>(
        'SELECT * FROM users WHERE LOWER(username) = LOWER(?) AND active = 1 LIMIT 1',
        [username],
      );
      const u = rows[0];
      if (!u) return null;
      return u.password_hash === hashPw(password) ? userFromRow(u) : null;
    },
    async createSession(userId, hours) {
      const t = randomUUID();
      await pool.query(
        'INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR))',
        [t, userId, hours ?? SESSION_HOURS],
      );
      return t;
    },
    async endSession(token) {
      await pool.query('DELETE FROM sessions WHERE token = ?', [token]);
    },
    async userFromSession(token) {
      if (!token) return null;
      const [rows] = await pool.query<UserRow[]>(
        `SELECT u.* FROM users u
           JOIN sessions s ON s.user_id = u.id
          WHERE s.token = ? AND s.expires_at > NOW() AND u.active = 1
          LIMIT 1`,
        [token],
      );
      return rows[0] ? userFromRow(rows[0]) : null;
    },
    async getRole(id) {
      const [rows] = await pool.query<RoleRow[]>('SELECT * FROM permissions WHERE role_id = ? LIMIT 1', [id]);
      return rows[0] ? roleFromRow(rows[0]) : null;
    },

    async getCompany() {
      const [rows] = await pool.query<CompanyRow[]>('SELECT * FROM company_info WHERE id = 1 LIMIT 1');
      const r = rows[0];
      if (!r) return { name: '', address: '', phone: '', email: '', gstin: '', logoDataUrl: '' };
      return {
        name: r.name, address: r.address, phone: r.phone, email: r.email,
        gstin: r.gstin, logoDataUrl: r.logo_data_url,
      };
    },
    async setCompany(next) {
      await pool.query(
        `INSERT INTO company_info (id, name, address, phone, email, gstin, logo_data_url)
         VALUES (1, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           name = VALUES(name), address = VALUES(address), phone = VALUES(phone),
           email = VALUES(email), gstin = VALUES(gstin), logo_data_url = VALUES(logo_data_url)`,
        [next.name, next.address, next.phone, next.email, next.gstin ?? '', next.logoDataUrl ?? ''],
      );
      return this.getCompany();
    },

    async listRoles() {
      const [rows] = await pool.query<RoleRow[]>('SELECT * FROM permissions ORDER BY name');
      return rows.map(roleFromRow);
    },
    async addRole(r) {
      const id = randomUUID();
      const p = r.permissions ?? perms(false);
      await pool.query(
        'INSERT INTO permissions (role_id, name, description, perms_json) VALUES (?, ?, ?, ?)',
        [id, r.name, r.description ?? '', JSON.stringify(p)],
      );
      return { id, name: r.name, description: r.description, permissions: p };
    },
    async updateRole(id, patch) {
      const current = await this.getRole(id); if (!current) return null;
      const next = { ...current, ...patch };
      await pool.query(
        'UPDATE permissions SET name = ?, description = ? WHERE role_id = ?',
        [next.name, next.description ?? '', id],
      );
      return next;
    },
    async updateRolePermissions(id, p: Permissions) {
      const current = await this.getRole(id); if (!current) return null;
      await pool.query('UPDATE permissions SET perms_json = ? WHERE role_id = ?', [JSON.stringify(p), id]);
      return { ...current, permissions: p };
    },
    async deleteRole(id) {
      const [rows] = await pool.query<RowDataPacket[]>('SELECT 1 FROM users WHERE role_id = ? LIMIT 1', [id]);
      if (rows.length) return { ok: false, error: 'Role is assigned to one or more users.' };
      await pool.query('DELETE FROM permissions WHERE role_id = ?', [id]);
      return { ok: true };
    },

    async listUsers() {
      const [rows] = await pool.query<UserRow[]>('SELECT * FROM users ORDER BY username');
      return rows.map(userFromRow);
    },
    async addUser(u) {
      const [exists] = await pool.query<RowDataPacket[]>(
        'SELECT 1 FROM users WHERE username = ? LIMIT 1', [u.username],
      );
      if (exists.length) throw new Error('Username already exists');
      const role = await this.getRole(u.roleId);
      if (!role) throw new Error('Unknown role');
      const id = randomUUID();
      await pool.query(
        `INSERT INTO users (id, username, password_hash, full_name, email, role_id, active)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, u.username, hashPw(u.password), u.fullName, u.email ?? '', u.roleId, u.active ? 1 : 0],
      );
      return { id, username: u.username, fullName: u.fullName, email: u.email ?? '', roleId: u.roleId, active: u.active };
    },
    async updateUser(id, patch) {
      const [rows] = await pool.query<UserRow[]>('SELECT * FROM users WHERE id = ? LIMIT 1', [id]);
      const current = rows[0]; if (!current) return null;
      const next: User = {
        id: current.id,
        username: patch.username ?? current.username,
        fullName:  patch.fullName ?? current.full_name,
        email:     patch.email    ?? current.email,
        roleId:    patch.roleId   ?? current.role_id,
        active:    patch.active   ?? !!current.active,
      };
      await pool.query(
        `UPDATE users SET username = ?, full_name = ?, email = ?, role_id = ?, active = ?
         ${patch.password ? ', password_hash = ?' : ''}
         WHERE id = ?`,
        patch.password
          ? [next.username, next.fullName, next.email, next.roleId, next.active ? 1 : 0, hashPw(patch.password), id]
          : [next.username, next.fullName, next.email, next.roleId, next.active ? 1 : 0, id],
      );
      return next;
    },
    async deleteUser(id) {
      await pool.query('DELETE FROM users WHERE id = ?', [id]);
      // sessions.user_id FK cascades DELETE, so the row is gone already.
    },
  } satisfies AdminStore;
}

async function seedIfEmpty(pool: Pool) {
  const [[{ roleCount }]] = await pool.query<(RowDataPacket & { roleCount: number })[]>(
    'SELECT COUNT(*) AS roleCount FROM permissions',
  ) as unknown as [[{ roleCount: number }]];
  if (!roleCount) {
    const admin = { id: randomUUID(), name: 'Administrator', description: 'Full access', perms: perms(true) };
    const operator = { id: randomUUID(), name: 'Operator',   description: 'View + control', perms: perms(false) };
    const viewer = { id: randomUUID(), name: 'Viewer',     description: 'Read-only',      perms: perms(false) };
    NAV.forEach(k => { operator.perms.nav[k].view = true; });
    MODES.forEach(m => { operator.perms.controlModes[m].view = true; operator.perms.controlModes[m].edit = true; });
    operator.perms.nav.administration.view = false;
    NAV.forEach(k => { viewer.perms.nav[k].view = k !== 'administration'; });
    MODES.forEach(m => { viewer.perms.controlModes[m].view = true; });

    for (const r of [admin, operator, viewer]) {
      await pool.query(
        'INSERT INTO permissions (role_id, name, description, perms_json) VALUES (?, ?, ?, ?)',
        [r.id, r.name, r.description, JSON.stringify(r.perms)],
      );
    }
    await pool.query(
      `INSERT INTO users (id, username, password_hash, full_name, email, role_id, active)
       VALUES (?, 'admin', ?, 'Plant Administrator', 'admin@example.com', ?, 1)`,
      [randomUUID(), hashPw('admin'), admin.id],
    );
  }

  const [[{ companyCount }]] = await pool.query<(RowDataPacket & { companyCount: number })[]>(
    'SELECT COUNT(*) AS companyCount FROM company_info',
  ) as unknown as [[{ companyCount: number }]];
  if (!companyCount) {
    await pool.query(
      `INSERT INTO company_info (id, name, address, phone, email, gstin, logo_data_url)
       VALUES (1, 'Gujarat Metal Cast', '', '', '', '', '')`,
    );
  }
}
