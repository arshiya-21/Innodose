/**
 * Factory for the admin store. Picks the driver from `ADMIN_DRIVER`:
 *   - 'mysql'  → persisted MySQL store (requires MYSQL_* env vars)
 *   - default  → in-memory store (resets on restart)
 */
import type { AdminStore } from './types.ts';
import { makeMemoryStore } from './memoryStore.ts';
import { makeMysqlStore } from './mysqlStore.ts';

export type { AdminStore, User, Role, CompanyInfo, Permissions, NavKey, ControlMode, Action } from './types.ts';

export async function makeAdminStore(): Promise<AdminStore> {
  const driver = (process.env.ADMIN_DRIVER ?? 'memory').toLowerCase();
  if (driver === 'mysql') {
    try { return await makeMysqlStore(); }
    catch (e) {
      console.error('[admin] MySQL init failed, falling back to in-memory store:', (e as Error).message);
      return makeMemoryStore();
    }
  }
  return makeMemoryStore();
}
