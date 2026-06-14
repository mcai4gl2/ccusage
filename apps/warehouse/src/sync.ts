// apps/warehouse/src/sync.ts
import { openWarehouse, defaultWarehousePath } from './db.js';
import { loadSessions } from './loaders/sessions.js';
import { loadDaily } from './loaders/daily.js';
import { loadAgentSessions, loadAgentDaily } from './loaders/agent.js';
import { upsertSessions, upsertSessionRows } from './etl/sessions.js';
import { upsertDailyUsage, upsertDailyRows } from './etl/daily.js';
import { upsertProjects } from './etl/projects.js';
import { readState, writeState } from './state.js';
import { createViews } from './views.js';

export interface SyncOptions {
  dbPath?: string;
  ccusageBin?: string;
  full?: boolean;
}

// Agents beyond claude that use the generic loader (no git enrichment, no incremental state)
const EXTRA_AGENTS = ['codex', 'opencode', 'gemini'] as const;

export async function sync(opts: SyncOptions = {}): Promise<void> {
  const dbPath = opts.dbPath ?? defaultWarehousePath();
  console.log(`Warehouse: ${dbPath}`);

  const db = await openWarehouse(dbPath);
  try {
    // --- Claude (incremental, git-enriched) ---
    const state = opts.full
      ? { lastProcessedTimestamp: null, lastProcessedSession: null }
      : await readState(db, 'ccusage-sessions');

    const sinceDate = state.lastProcessedTimestamp
      ? state.lastProcessedTimestamp.slice(0, 10).replace(/-/g, '')
      : undefined;

    console.log(`Loading claude sessions${sinceDate ? ` since ${sinceDate}` : ' (all)'}...`);
    const sessions = loadSessions({ ccusageBin: opts.ccusageBin, since: sinceDate });
    console.log(`  → ${sessions.length} sessions`);

    console.log('Loading claude daily usage...');
    const daily = loadDaily({ ccusageBin: opts.ccusageBin, since: sinceDate });
    console.log(`  → ${daily.length} daily rows`);

    const sessionCount = await upsertSessions(db, sessions);
    console.log(`  Upserted ${sessionCount} session rows`);

    const dailyCount = await upsertDailyUsage(db, daily);
    console.log(`  Upserted ${dailyCount} daily_usage rows`);

    await upsertProjects(db, sessions);
    console.log(`  Projects updated`);

    if (sessions.length > 0) {
      const latest = sessions.reduce((best, s) =>
        (s.lastActivity ?? '') > (best.lastActivity ?? '') ? s : best,
      );
      await writeState(db, 'ccusage-sessions', {
        lastProcessedTimestamp: latest.lastActivity,
        lastProcessedSession: latest.sessionId,
      });
    }

    // --- Extra agents (always full sync — volumes are small, upsert is idempotent) ---
    for (const agent of EXTRA_AGENTS) {
      console.log(`\nLoading ${agent} sessions...`);
      let agentSessions;
      try {
        agentSessions = loadAgentSessions(agent, { ccusageBin: opts.ccusageBin });
      } catch (err) {
        console.log(`  Skipped (${err instanceof Error ? err.message : String(err)})`);
        continue;
      }
      console.log(`  → ${agentSessions.length} sessions`);
      const agentSessionCount = await upsertSessionRows(db, agentSessions);
      console.log(`  Upserted ${agentSessionCount} session rows`);

      console.log(`Loading ${agent} daily usage...`);
      let agentDaily;
      try {
        agentDaily = loadAgentDaily(agent, { ccusageBin: opts.ccusageBin });
      } catch (err) {
        console.log(`  Skipped (${err instanceof Error ? err.message : String(err)})`);
        continue;
      }
      console.log(`  → ${agentDaily.length} daily rows`);
      const agentDailyCount = await upsertDailyRows(db, agentDaily);
      console.log(`  Upserted ${agentDailyCount} daily_usage rows`);
    }

    await createViews(db);
    console.log('\nSync complete.');
  } finally {
    await db.close();
  }
}
