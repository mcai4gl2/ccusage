// apps/warehouse/src/db.ts
import { Database } from 'duckdb-async';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { ALL_SCHEMAS } from './schema.js';

export function defaultWarehousePath(): string {
  const base = join(homedir(), '.local', 'share', 'ccusage');
  mkdirSync(base, { recursive: true });
  return join(base, 'warehouse.db');
}

export type Warehouse = {
  run: (sql: string, ...params: unknown[]) => Promise<void>;
  query: <T = Record<string, unknown>>(sql: string, ...params: unknown[]) => Promise<T[]>;
  close: () => Promise<void>;
};

export async function openWarehouse(dbPath: string): Promise<Warehouse> {
  const db = await Database.create(dbPath);
  for (const ddl of ALL_SCHEMAS) {
    await db.run(ddl);
  }
  return {
    async run(sql: string, ...params: unknown[]): Promise<void> {
      await db.run(sql, ...params);
    },
    async query<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T[]> {
      const result = await db.all(sql, ...params);
      return result as unknown as T[];
    },
    async close(): Promise<void> {
      await db.close();
    },
  };
}
