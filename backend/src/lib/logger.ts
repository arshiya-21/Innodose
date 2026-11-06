/**
 * Minimal leveled logger with an optional scope.
 *
 *   log.info('server ready')                 →  INFO  server ready
 *   log.warn('config missing')               →  WARN  config missing
 *   const userLog = log.child('admin')
 *   userLog.info('updated permissions')      →  INFO  [admin] updated permissions
 *
 * Attach a per-user child logger to every authenticated request so audit-worthy
 * events carry the username automatically (see `requireAuthV1`).
 */
export interface Logger {
  debug: (msg: string, extra?: unknown) => void;
  info:  (msg: string, extra?: unknown) => void;
  warn:  (msg: string, extra?: unknown) => void;
  error: (msg: string, extra?: unknown) => void;
  child: (scope: string) => Logger;
  banner: (title: string, rows: Array<[string, string | number | boolean]>) => void;
}

type Level = 'debug' | 'info' | 'warn' | 'error';
const LEVEL_ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const THRESHOLD = LEVEL_ORDER[(process.env.LOG_LEVEL as Level) ?? 'info'] ?? LEVEL_ORDER.info;
const LABEL: Record<Level, string> = { debug: 'DEBUG', info: 'INFO ', warn: 'WARN ', error: 'ERROR' };

function emit(level: Level, scope: string, msg: string, extra?: unknown) {
  if (LEVEL_ORDER[level] < THRESHOLD) return;
  const prefix = `${LABEL[level]} ${scope ? `[${scope}] ` : ''}`;
  const stream = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  if (extra !== undefined) stream(prefix + msg, extra);
  else stream(prefix + msg);
}

export function makeLogger(scope = ''): Logger {
  return {
    debug: (m, e) => emit('debug', scope, m, e),
    info:  (m, e) => emit('info',  scope, m, e),
    warn:  (m, e) => emit('warn',  scope, m, e),
    error: (m, e) => emit('error', scope, m, e),
    child: (s)    => makeLogger(scope ? `${scope}:${s}` : s),
    banner(title, rows) {
      emit('info', '', title);
      for (const [k, v] of rows) console.log(`  ${k}: ${v}`);
    },
  };
}

export const log = makeLogger();
