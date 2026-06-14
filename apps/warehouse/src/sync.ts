// apps/warehouse/src/sync.ts
import { openWarehouse, defaultWarehousePath } from './db.js';
import { loadSessions } from './loaders/sessions.js';
import { loadDaily } from './loaders/daily.js';
import { upsertSessions } from './etl/sessions.js';
import { upsertDailyUsage } from './etl/daily.js';
import { upsertProjects } from './etl/projects.js';
import { readState, writeState } from './state.js';
import { createViews } from './views.js';

export interface SyncOptions {
  dbPath?: string;
  ccusageBin?: string;
  full?: boolean;
}

export async function sync(opts: SyncOptions = {}): Promise<void> {
  const dbPath = opts.dbPath ?? defaultWarehousePath();
  console.log(`Warehouse: ${dbPath}`);

  const db = await openWarehouse(dbPath);
  try {
    const state = opts.full
      ? { lastProcessedTimestamp: null, lastProcessedSession: null }
      : await readState(db, 'ccusage-sessions');

    const sinceDate = state.lastProcessedTimestamp
      ? state.lastProcessedTimestamp.slice(0, 10).replace(/-/g, '')
      : undefined;

    console.log(`Loading sessions${sinceDate ? ` since ${sinceDate}` : ' (all)'}...`);
    const sessions = loadSessions({ ccusageBin: opts.ccusageBin, since: sinceDate });
    console.log(`  → ${sessions.length} sessions`);

    console.log('Loading daily usage...');
    const daily = loadDaily({ ccusageBin: opts.ccusageBin, since: sinceDate });
    console.log(`  → ${daily.length} daily rows`);

    const sessionCount = await upsertSessions(db, sessions);
    console.log(`  Upserted ${sessionCount} session rows`);

    const dailyCount = await upsertDailyUsage(db, daily);
    console.log(`  Upserted ${dailyCount} daily_usage rows`);

    await upsertProjects(db, sessions);
    console.log(`  Projects updated`);

    await createViews(db);

    if (sessions.length > 0) {
      const latest = sessions.reduce((best, s) =>
        (s.lastActivity ?? '') > (best.lastActivity ?? '') ? s : best,
      );
      await writeState(db, 'ccusage-sessions', {
        lastProcessedTimestamp: latest.lastActivity,
        lastProcessedSession: latest.sessionId,
      });
    }

    console.log('Sync complete.');
  } finally {
    await db.close();
  }
}
