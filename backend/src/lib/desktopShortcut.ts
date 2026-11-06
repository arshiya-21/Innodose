/**
 * Creates an "Inodose" icon on the Windows desktop the first time the backend starts (never again once it exists).
 * Clicking it opens the app in the default browser using this PC's network address instead of localhost.
 *
 *  - Windows only; does nothing elsewhere. Set DESKTOP_SHORTCUT=off to disable.
 *  - Address: APP_PUBLIC_URL if set, otherwise this PC's connected LAN IPv4 (physical adapters first,
 *    Ethernet before Wi-Fi; virtual/WSL/link-local addresses are ignored).
 *  - Port: the backend port when the built frontend is being served by it, otherwise the Vite dev port 5173.
 *  - Created once: if Inodose.url is already on the desktop it is left alone. Delete it to have it re-created.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { log as rootLog } from './logger.ts';

const log = rootLog.child('shortcut');
const VIRTUAL = /vethernet|wsl|virtual|vmware|vbox|hyper-v|docker|loopback|bluetooth/i;

function lanAddress(): string | null {
  const found: { ip: string; rank: number }[] = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    if (VIRTUAL.test(name)) continue;
    for (const a of addrs ?? []) {
      if (a.family !== 'IPv4' || a.internal || a.address.startsWith('169.254.')) continue;
      found.push({ ip: a.address, rank: /ethernet|^eth/i.test(name) ? 0 : 1 });
    }
  }
  found.sort((a, b) => a.rank - b.rank);
  return found[0]?.ip ?? null;
}

function desktopDir(): Promise<string> {
  return new Promise((resolve) => {
    execFile('powershell', ['-NoProfile', '-Command', "[Environment]::GetFolderPath('Desktop')"], { timeout: 8000 }, (err, out) => {
      const p = String(out ?? '').trim();
      resolve(!err && p ? p : path.join(os.homedir(), 'Desktop'));
    });
  });
}

export async function ensureDesktopShortcut(port: number, spaServed: boolean): Promise<void> {
  if (process.platform !== 'win32' || (process.env.DESKTOP_SHORTCUT ?? '').toLowerCase() === 'off') return;
  try {
    const url = process.env.APP_PUBLIC_URL || (() => {
      const ip = lanAddress();
      return ip ? `http://${ip}:${spaServed ? port : 5173}/` : null;
    })();
    if (!url) return log.warn('no network address found — desktop icon not created');

    const dir = await desktopDir();
    const file = path.join(dir, 'Inodose.url');
    const chrome = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].find((p) => fs.existsSync(p));
    const body = `[InternetShortcut]\r\nURL=${url}\r\n${chrome ? `IconFile=${chrome}\r\nIconIndex=0\r\n` : ''}`;
    if (fs.existsSync(file)) return; // created once only: never touched again (delete the icon to have it re-created)
    fs.writeFileSync(file, body);
    log.info(`desktop icon ready → ${url}`);
  } catch (e) {
    log.warn(`could not create the desktop icon: ${(e as Error).message}`);
  }
}
