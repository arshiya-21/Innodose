/**
 * GET/PUT /api/v1/administration/email-settings — SMTP account used for alert e-mails.
 * Single-row store (`email_settings.id = 1`).
 *
 * Password rule (same as DB Details): on read the real password is replaced with a fixed mask so it never
 * travels back to the browser; on write that mask means "keep the stored password".
 */
import { Router, type Request } from 'express';
import nodemailer from 'nodemailer';
import mysql, { type Pool, type RowDataPacket } from 'mysql2/promise';
import type { AdminStore } from '../admin/store.ts';
import { requireAuthV1 } from './authV1.ts';

const PASSWORD_MASK = '•••••';
const SECURITY = ['starttls', 'ssl', 'none'] as const;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  enabled: 0 | 1; smtp_host: string; smtp_port: string; security: string;
  username: string; password: string; from_name: string; from_email: string;
  verified: 0 | 1;
}

/** Well-known providers: the SMTP server follows from the e-mail domain, so the admin only types e-mail + app password. */
function smtpFor(email: string, fallbackHost: string, fallbackPort: string) {
  const d = email.split('@')[1]?.toLowerCase() ?? '';
  if (d === 'gmail.com' || d === 'googlemail.com') return { host: 'smtp.gmail.com', port: '587', security: 'starttls' };
  if (/^(outlook|hotmail|live|msn)\./.test(d)) return { host: 'smtp.office365.com', port: '587', security: 'starttls' };
  if (/^yahoo\./.test(d)) return { host: 'smtp.mail.yahoo.com', port: '587', security: 'starttls' };
  return { host: fallbackHost || `smtp.${d}`, port: fallbackPort || '587', security: 'starttls' };
}

/** Log in to the SMTP server for real (and optionally send a test mail). Resolves to null on success, else a readable reason. */
async function checkLogin(host: string, port: string, security: string, user: string, pass: string, sendTo?: string): Promise<string | null> {
  const t = nodemailer.createTransport({
    host, port: Number(port), secure: security === 'ssl', requireTLS: security === 'starttls',
    auth: { user, pass }, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
  });
  try {
    await t.verify();
    if (sendTo) {
      await t.sendMail({
        from: `"Inodose Alerts" <${user}>`, to: sendTo, subject: 'Inodose: e-mail alerts are connected',
        text: 'This is a test message from Inodose. Alert e-mails will be sent from this account.',
      });
    }
    return null;
  } catch (e) {
    const m = (e as Error).message || 'Could not connect';
    if (/535|Invalid login|not accepted|AUTH/i.test(m)) return 'Login rejected. Use an App Password (not your normal password) and check the e-mail address.';
    if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|timeout/i.test(m)) return 'Could not reach the mail server. Check the internet connection.';
    return m;
  } finally { t.close(); }
}

function shape(r: Row) {
  return {
    enabled: !!r.enabled,
    host: r.smtp_host,
    port: r.smtp_port,
    security: r.security,
    user: r.username,
    password: r.password ? PASSWORD_MASK : '',
    fromName: r.from_name,
    fromEmail: r.from_email,
    /** a real login succeeded with the saved account, so alert e-mails can be sent */
    connected: !!r.verified && !!r.enabled && !!r.password && !!r.username,
  };
}

export function v1EmailSettingsRouter(store: AdminStore) {
  const r = Router();
  const auth = requireAuthV1(store);

  r.get('/administration/email-settings', auth, async (_req, res) => {
    const p = getPool();
    if (!p) return res.status(503).json({ message: 'Email settings store unavailable' });
    const [rows] = await p.query<Row[]>('SELECT * FROM email_settings WHERE id = 1 LIMIT 1');
    if (!rows[0]) return res.status(500).json({ message: 'Row is missing — did migration 014 run?' });
    res.json(shape(rows[0]));
  });

  r.put('/administration/email-settings', auth, async (req, res) => {
    const p = getPool();
    if (!p) return res.status(503).json({ message: 'Email settings store unavailable' });
    const body = req.body ?? {};

    const host = String(body.host ?? '').trim();
    const port = String(body.port ?? '').trim();
    const security = String(body.security ?? 'starttls');
    const fromEmail = String(body.fromEmail ?? '').trim();
    if (body.enabled) {
      if (!host) return res.status(400).json({ message: 'SMTP host is required.' });
      if (!/^\d{1,5}$/.test(port)) return res.status(400).json({ message: 'SMTP port must be a number.' });
      if (!EMAIL_RE.test(fromEmail)) return res.status(400).json({ message: 'Enter a valid "From" e-mail address.' });
    }
    if (!(SECURITY as readonly string[]).includes(security)) return res.status(400).json({ message: 'Unknown security type.' });

    let password: string;
    if (body.password === undefined || body.password === null || body.password === PASSWORD_MASK) {
      const [rows] = await p.query<Row[]>('SELECT password FROM email_settings WHERE id = 1 LIMIT 1');
      password = rows[0]?.password ?? '';
    } else {
      password = String(body.password);
    }

    const who = (req as Request & { user?: { username?: string } }).user?.username ?? null;
    await p.query(
      `UPDATE email_settings SET
         enabled = ?, smtp_host = ?, smtp_port = ?, security = ?, username = ?, password = ?,
         from_name = ?, from_email = ?, updated_by = ?, verified = 0
       WHERE id = 1`,
      [body.enabled ? 1 : 0, host, port, security, String(body.user ?? '').trim(), password,
       String(body.fromName ?? '').trim(), fromEmail, who],
    );
    const [after] = await p.query<Row[]>('SELECT * FROM email_settings WHERE id = 1 LIMIT 1');
    res.json(shape(after[0]));
  });

  /**
   * Simple setup: just an e-mail address + app password. Logs in for real, then saves it and turns alert
   * e-mails on. Nothing is stored when the login fails.
   */
  r.put('/administration/email-settings/simple', auth, async (req, res) => {
    const p = getPool();
    if (!p) return res.status(503).json({ message: 'Email settings store unavailable' });
    const email = String(req.body?.email ?? '').trim();
    if (!EMAIL_RE.test(email)) return res.status(400).json({ message: 'Enter a valid e-mail address.' });
    const [cur] = await p.query<Row[]>('SELECT * FROM email_settings WHERE id = 1 LIMIT 1');
    let pass = String(req.body?.password ?? '');
    if (!pass || pass === PASSWORD_MASK) {
      if (!cur[0]?.password || cur[0].username !== email) return res.status(400).json({ message: 'Enter the app password.' });
      pass = cur[0].password;
    }
    pass = pass.replace(/\s+/g, ''); // Google shows the app password in groups of four; the spaces are not part of it
    const smtp = smtpFor(email, cur[0]?.smtp_host ?? '', cur[0]?.smtp_port ?? '');
    const err = await checkLogin(smtp.host, smtp.port, smtp.security, email, pass);
    if (err) return res.status(400).json({ message: err });
    const who = (req as Request & { user?: { username?: string } }).user?.username ?? null;
    await p.query(
      `UPDATE email_settings SET enabled = 1, verified = 1, verified_at = NOW(), smtp_host = ?, smtp_port = ?, security = ?,
         username = ?, password = ?, from_email = ?, updated_by = ? WHERE id = 1`,
      [smtp.host, smtp.port, smtp.security, email, pass, email, who],
    );
    const [after] = await p.query<Row[]>('SELECT * FROM email_settings WHERE id = 1 LIMIT 1');
    res.json(shape(after[0]));
  });

  /** Test button: log in with what is typed (nothing is saved) and send a test mail to the address itself. */
  r.post('/administration/email-settings/test', auth, async (req, res) => {
    const p = getPool();
    if (!p) return res.status(503).json({ message: 'Email settings store unavailable' });
    const email = String(req.body?.email ?? '').trim();
    if (!EMAIL_RE.test(email)) return res.status(400).json({ ok: false, message: 'Enter a valid e-mail address.' });
    const [cur] = await p.query<Row[]>('SELECT * FROM email_settings WHERE id = 1 LIMIT 1');
    let pass = String(req.body?.password ?? '');
    if (!pass || pass === PASSWORD_MASK) {
      if (!cur[0]?.password || cur[0].username !== email) return res.status(400).json({ ok: false, message: 'Enter the app password.' });
      pass = cur[0].password;
    }
    pass = pass.replace(/\s+/g, '');
    const smtp = smtpFor(email, cur[0]?.smtp_host ?? '', cur[0]?.smtp_port ?? '');
    const err = await checkLogin(smtp.host, smtp.port, smtp.security, email, pass, email);
    if (err) return res.status(400).json({ ok: false, message: err });
    res.json({ ok: true, message: `Connected. A test e-mail was sent to ${email}.` });
  });

  /** Anyone signed in can ask whether alert e-mails are set up (the Alerts page shows a notice if not). */
  r.get('/email-status', auth, async (_req, res) => {
    const p = getPool();
    if (!p) return res.json({ connected: false, email: '' });
    const [rows] = await p.query<Row[]>('SELECT * FROM email_settings WHERE id = 1 LIMIT 1');
    res.json({ connected: rows[0] ? shape(rows[0]).connected : false, email: rows[0]?.username ?? '' });
  });

  return r;
}
