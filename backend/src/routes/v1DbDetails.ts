/**
 * GET/PUT /api/v1/administration/db-details — settings pane for the MySQL
 * connection + optional SSH tunnel. Single-row store (`db_details.id = 1`).
 *
 * Password rule: on read, the real password is replaced with a fixed masked
 * placeholder ('•••••') so it never travels back to the browser. On write,
 * that same placeholder is understood as "keep the existing password"; any
 * other value overwrites it.
 */
import { Router, type Request } from 'express';
import mysql, { type Pool, type RowDataPacket } from 'mysql2/promise';
import type { AdminStore } from '../admin/store.ts';
import { requireAuthV1, requirePerm } from './authV1.ts';
import { tryConnect, writeEnv } from '../setup.ts';
import { log } from '../lib/logger.ts';

const PASSWORD_MASK = '•••••';

let pool: Pool | null = null;
function getPool(): Pool | null {
  if (pool) return pool;
  if ((process.env.ADMIN_DRIVER ?? 'memory') !== 'mysql') return null;
  pool = mysql.createPool({
    host: process.env.MYSQL_HOST ?? 'localhost',
    port: Number(process.env.MYSQL_PORT ?? 3306),
    user: process.env.MYSQL_USER ?? 'root',
    password: process.env.MYSQL_PASSWORD ?? '',
    database: process.env.MYSQL_DATABASE ?? 'inodose_test',
    waitForConnections: true, connectionLimit: 3,
  });
  return pool;
}

interface Row extends RowDataPacket {
  db_type: string;
  host: string; port: string;
  username: string; password: string; db_name: string;
  use_ssh_tunnel: 0 | 1;
  ssh_host: string; ssh_port: string; ssh_user: string; ssh_private_key_path: string;
}

function shape(r: Row) {
  return {
    type: r.db_type,
    host: r.host,
    port: r.port,
    user: r.username,
    password: r.password ? PASSWORD_MASK : '',
    database: r.db_name,
    useSshTunnel: !!r.use_ssh_tunnel,
    ssh: {
      host: r.ssh_host,
      port: r.ssh_port,
      user: r.ssh_user,
      privateKeyPath: r.ssh_private_key_path,
    },
  };
}

export function v1DbDetailsRouter(store: AdminStore) {
  const r = Router();
  const auth = requireAuthV1(store);

  r.get('/administration/db-details', auth, async (_req, res) => {
    const p = getPool();
    if (!p) return res.status(503).json({ message: 'DB details store unavailable' });
    const [rows] = await p.query<Row[]>('SELECT * FROM db_details WHERE id = 1 LIMIT 1');
    if (!rows[0]) return res.status(500).json({ message: 'Row is missing — did migrations run?' });
    // The connection actually in use comes from .env; show that (the stored row can be out of date).
    const live = shape(rows[0]);
    res.json({ ...live, host: process.env.MYSQL_HOST ?? live.host, port: process.env.MYSQL_PORT ?? live.port, user: process.env.MYSQL_USER ?? live.user, database: process.env.MYSQL_DATABASE ?? live.database, password: process.env.MYSQL_PASSWORD ? PASSWORD_MASK : live.password });
  });

  r.put('/administration/db-details', auth, requirePerm(store, 'administration', 'edit'), async (req, res) => {
    const p = getPool();
    if (!p) return res.status(503).json({ message: 'DB details store unavailable' });
    const body = req.body ?? {};
    const ssh = body.ssh ?? {};

    // Preserve the existing password when the client sends back the mask.
    let password: string;
    if (body.password === undefined || body.password === null || body.password === PASSWORD_MASK) {
      const [rows] = await p.query<Row[]>('SELECT password FROM db_details WHERE id = 1 LIMIT 1');
      password = rows[0]?.password ?? '';
    } else {
      password = String(body.password);
    }

    const who = (req as Request & { user?: { username?: string } }).user?.username ?? null;
    await p.query(
      `UPDATE db_details SET
         db_type = ?, host = ?, port = ?, username = ?, password = ?, db_name = ?,
         use_ssh_tunnel = ?,
         ssh_host = ?, ssh_port = ?, ssh_user = ?, ssh_private_key_path = ?,
         updated_by = ?
       WHERE id = 1`,
      [
        String(body.type ?? 'mysql'),
        String(body.host ?? ''),
        String(body.port ?? ''),
        String(body.user ?? ''),
        password,
        String(body.database ?? ''),
        body.useSshTunnel ? 1 : 0,
        String(ssh.host ?? ''),
        String(ssh.port ?? '22'),
        String(ssh.user ?? ''),
        String(ssh.privateKeyPath ?? ''),
        who,
      ],
    );
    const [after] = await p.query<Row[]>('SELECT * FROM db_details WHERE id = 1 LIMIT 1');

    // Apply the change for real: test the new connection, write it to .env, then restart the process.
    // The service manager (Windows service / systemd) starts it again with the new details.
    const real = process.env.MYSQL_PASSWORD ?? '';
    const pw = body.password === undefined || body.password === null || body.password === PASSWORD_MASK ? real : password;
    const next = { host: String(body.host ?? '').trim(), port: String(body.port ?? '3306').trim() || '3306', user: String(body.user ?? '').trim(), password: pw, database: String(body.database ?? '').trim() };
    const changed = next.host !== (process.env.MYSQL_HOST ?? '') || next.port !== (process.env.MYSQL_PORT ?? '3306') || next.user !== (process.env.MYSQL_USER ?? '')
      || next.database !== (process.env.MYSQL_DATABASE ?? '') || next.password !== real;
    if (changed && body.type !== 'postgres') {
      if (!next.host || !next.user || !next.database) return res.status(400).json({ message: 'Host, user and database are required.' });
      const err = await tryConnect(next);
      if (err) return res.status(400).json({ message: `Not saved — ${err}` });
      writeEnv({ MYSQL_HOST: next.host, MYSQL_PORT: next.port, MYSQL_USER: next.user, MYSQL_PASSWORD: next.password, MYSQL_DATABASE: next.database, MYSQL_DATA_DATABASE: next.database });
      log.warn(`database connection changed by ${who ?? 'unknown'} — restarting to apply`);
      res.json({ ...shape(after[0]), restarting: true });
      setTimeout(() => process.exit(0), 800); // service manager restarts it with the new .env
      return;
    }
    res.json(shape(after[0]));
  });

  return r;
}
