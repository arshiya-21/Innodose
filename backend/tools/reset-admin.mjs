/**
 * Restores:
 *   - Administrator role with every permission (nav + control modes, C/E/V/D)
 *   - `admin` user with password `admin`, Administrator role, active
 *
 * Run this when the admin account has been locked out, its permissions
 * cleared, or its password changed. Does NOT touch other roles or users.
 *
 *   node tools/reset-admin.mjs
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';
import { createHash, randomUUID } from 'node:crypto';

const NAV = ['live-dashboard', 'control-panel', 'past-records', 'configurations', 'administration'];
const MODES = ['manual', 'auto', 'joystick'];
const ACTIONS = ['view', 'add', 'edit', 'delete'];

function fullPerms() {
  const row = () => ACTIONS.reduce((o, a) => ({ ...o, [a]: true }), {});
  return {
    nav: NAV.reduce((o, k) => ({ ...o, [k]: row() }), {}),
    controlModes: MODES.reduce((o, k) => ({ ...o, [k]: row() }), {}),
  };
}
const hashPw = pw => createHash('sha256').update(pw).digest('hex');

const conn = await mysql.createConnection({
  host: process.env.MYSQL_HOST ?? 'localhost',
  port: Number(process.env.MYSQL_PORT ?? 3306),
  user: process.env.MYSQL_USER ?? 'root',
  password: process.env.MYSQL_PASSWORD ?? '',
  database: process.env.MYSQL_DATABASE ?? 'inodose_test',
});

// Ensure the Administrator role exists with full permissions.
const [adminRows] = await conn.query(
  `SELECT role_id FROM permissions WHERE name = 'Administrator' LIMIT 1`,
);
let adminRoleId;
if (adminRows[0]) {
  adminRoleId = adminRows[0].role_id;
  await conn.query(
    `UPDATE permissions SET perms_json = ? WHERE role_id = ?`,
    [JSON.stringify(fullPerms()), adminRoleId],
  );
  console.log(`Administrator role restored to full permissions (id=${adminRoleId}).`);
} else {
  adminRoleId = randomUUID();
  await conn.query(
    `INSERT INTO permissions (role_id, name, description, perms_json)
     VALUES (?, 'Administrator', 'Full access', ?)`,
    [adminRoleId, JSON.stringify(fullPerms())],
  );
  console.log(`Administrator role created (id=${adminRoleId}).`);
}

// Ensure the admin user exists, is active, and uses password `admin`.
const [userRows] = await conn.query(
  `SELECT id FROM users WHERE LOWER(username) = 'admin' LIMIT 1`,
);
if (userRows[0]) {
  await conn.query(
    `UPDATE users SET password_hash = ?, role_id = ?, active = 1 WHERE id = ?`,
    [hashPw('admin'), adminRoleId, userRows[0].id],
  );
  console.log(`admin user updated: password = 'admin', role = Administrator, active.`);
} else {
  await conn.query(
    `INSERT INTO users (id, username, password_hash, full_name, email, role_id, active)
     VALUES (?, 'admin', ?, 'Plant Administrator', 'admin@example.com', ?, 1)`,
    [randomUUID(), hashPw('admin'), adminRoleId],
  );
  console.log(`admin user created with password 'admin'.`);
}

await conn.end();
console.log('Done. Login at /login as: admin / admin');
