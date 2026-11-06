/**
 * Alert e-mail dispatcher.
 *
 * Alerts in this backend are derived from the dosing table (see classifyDose), so there is no "alert fired" event.
 * This worker polls for dosing rows added since it last looked, classifies each one with the same rules the
 * Live Dashboard uses, and e-mails the recipients of that alert type (alert_users, enabled = 1) using the SMTP
 * account saved in Administration → Settings → Email Alerts (email_settings).
 *
 * Notes
 *  - Only rows that appear AFTER the backend starts are mailed (the high-water mark starts at the current MAX(id)),
 *    so a restart never floods inboxes with history. Doses made while the backend was down are not mailed.
 *  - Nothing is sent unless the e-mail account is connected (enabled + verified) and the alert type is enabled.
 *  - A failed send is logged and not retried, so a broken mail server cannot cause a retry storm.
 */
import nodemailer from 'nodemailer';
import mysql, { type Pool, type RowDataPacket } from 'mysql2/promise';
import { classifyDose, isSettled } from './alertRules.ts';
import { loadAlertRules } from './v1Common.ts';
import { getAlertSource, q } from './alertSource.ts';
import { log as rootLog } from '../lib/logger.ts';

const log = rootLog.child('alert-mail');

const POLL_MS = Number(process.env.ALERT_MAIL_POLL_MS ?? 10_000);
const MAX_AGE_MS = 15 * 60_000; // never mail a dose older than this
const MAX_MAILS_PER_TICK = 20;

/** classifyDose() names → the alert_users.alert_name used by the Alerts admin screen. */
const RECIPIENT_NAME: Record<string, string> = {
  'Over Dose': 'over dose',
  'Under Dose': 'under dose',
  'Dose Miss': 'dose missed',
  'Pipe Choked': 'pipe chocked',
};
const LABEL: Record<string, string> = {
  'Over Dose': 'Over Dose', 'Under Dose': 'Under Dose', 'Dose Miss': 'Dose Missed', 'Pipe Choked': 'Pipe Chocked',
};

interface DoseRow extends RowDataPacket {
  id: number; datetime: string; box_count: number | null; component_id: string; component_name: string | null;
  actual: number | null; expected: number | null;
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export function startAlertMailer(): void {
  if ((process.env.ADMIN_DRIVER ?? 'memory') !== 'mysql') return;
  const pool: Pool = mysql.createPool({
    host: process.env.MYSQL_HOST ?? 'localhost',
    port: Number(process.env.MYSQL_PORT ?? 3306),
    user: process.env.MYSQL_USER ?? 'root',
    password: process.env.MYSQL_PASSWORD ?? '',
    database: process.env.MYSQL_DATABASE ?? 'inodose_test',
    waitForConnections: true, connectionLimit: 2, dateStrings: true,
  });

  let lastId: number | null = null;
  let busy = false;

  async function tick() {
    if (busy) return;
    busy = true;
    try {
      const src = await getAlertSource(pool);
      const t = q(src.table);

      if (lastId === null) {
        const [m] = await pool.query<RowDataPacket[]>(`SELECT COALESCE(MAX(id), 0) AS mx FROM ${t}`);
        lastId = Number(m[0]?.mx ?? 0);
        log.info(`started — watching ${src.table} after id ${lastId}`);
        return;
      }

      const [fetched] = await pool.query<DoseRow[]>(
        `SELECT c.id, c.datetime, c.\`BOX COUNT\` AS box_count, c.\`COMPONENT ID\` AS component_id,
                m.name AS component_name, c.\`POURING TIME\` AS pour, c.${q(src.column)} AS actual, m.expected_dosage_gms AS expected
           FROM ${t} c LEFT JOIN components m ON m.component_id = c.\`COMPONENT ID\`
          WHERE c.id > ? ORDER BY c.id ASC LIMIT 200`,
        [lastId],
      );
      // Stop at the first box that is still being dosed: it is picked up on a later tick, once it is complete.
      const firstOpen = fetched.findIndex((r) => !isSettled(r.datetime, (r as unknown as { pour: number | null }).pour));
      const rows = firstOpen === -1 ? fetched : fetched.slice(0, firstOpen);
      if (!rows.length) return;
      lastId = Number(rows[rows.length - 1].id); // advance first: a failure below must not cause re-sends

      const [cfg] = await pool.query<RowDataPacket[]>('SELECT * FROM email_settings WHERE id = 1 LIMIT 1');
      const s = cfg[0];
      if (!s || !s.enabled || !s.verified || !s.username || !s.password) return; // account not connected: nothing to send

      const rules = await loadAlertRules(pool);
      const alerts = rows
        .filter((r) => Date.now() - new Date(String(r.datetime).replace(' ', 'T')).getTime() <= MAX_AGE_MS)
        .map((r) => ({ r, type: classifyDose(r.actual, r.expected, rules.tols, rules.enabled) }))
        .filter((x): x is { r: DoseRow; type: NonNullable<typeof x.type> } => x.type !== null)
        .slice(0, MAX_MAILS_PER_TICK);
      if (!alerts.length) return;

      const [users] = await pool.query<RowDataPacket[]>('SELECT alert_name, email FROM alert_users WHERE enabled = 1');
      const byType = new Map<string, string[]>();
      for (const u of users) {
        const k = String(u.alert_name).trim().toLowerCase();
        const e = String(u.email ?? '').trim();
        if (e) (byType.get(k) ?? byType.set(k, []).get(k)!).push(e);
      }

      const transport = nodemailer.createTransport({
        host: s.smtp_host, port: Number(s.smtp_port), secure: s.security === 'ssl', requireTLS: s.security === 'starttls',
        auth: { user: s.username, pass: s.password }, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
      });
      try {
        const from = `"${String(s.from_name || 'Inodose Alerts').replace(/"/g, '')}" <${s.from_email || s.username}>`;
        for (const { r, type } of alerts) {
          const to = byType.get(RECIPIENT_NAME[type]) ?? [];
          if (!to.length) continue;
          const label = LABEL[type];
          const box = r.box_count != null ? `B-${r.box_count}` : '—';
          const fmt = (n: number | null) => (n == null ? 'n/a' : `${Number(n).toFixed(1)} gms`);
          try {
            await transport.sendMail({
              from, to, subject: `Inodose alert: ${label} — box ${box}`,
              html: `<p><b>${esc(label)}</b> was raised on the Inodose machine.</p><ul>
                <li><b>Date/Time:</b> ${esc(r.datetime)}</li>
                <li><b>Box:</b> ${esc(box)}</li>
                <li><b>Component:</b> ${esc(r.component_name ?? r.component_id)}</li>
                <li><b>Expected dose:</b> ${esc(fmt(r.expected))}</li>
                <li><b>Actual dose:</b> ${esc(fmt(r.actual))}</li></ul>`,
            });
            log.info(`sent ${label} (box ${box}) to ${to.length} recipient(s)`);
          } catch (e) {
            log.error(`could not send ${label} (box ${box}): ${(e as Error).message}`);
          }
        }
      } finally { transport.close(); }
    } catch (e) {
      log.error(`alert mailer tick failed: ${(e as Error).message}`);
    } finally { busy = false; }
  }

  void tick();
  setInterval(() => void tick(), POLL_MS).unref();
}
