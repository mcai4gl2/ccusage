// apps/warehouse/src/etl/daily.ts
import type { AllDailyRow } from '../types.js';
import type { DailyUsageRow } from '../schema.js';
import type { Warehouse } from '../db.js';

const DAILY_UPSERT_SQL = `
  INSERT INTO daily_usage (date, agent, project_path, session_count, total_tokens, total_cost_usd)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT (date, agent) DO UPDATE SET
    total_tokens   = excluded.total_tokens,
    total_cost_usd = excluded.total_cost_usd`;

export async function upsertDailyRows(db: Warehouse, rows: DailyUsageRow[]): Promise<number> {
  let count = 0;
  for (const r of rows) {
    await db.run(DAILY_UPSERT_SQL,
      r.date, r.agent, r.project_path, r.session_count, r.total_tokens, r.total_cost_usd,
    );
    count++;
  }
  return count;
}

export async function upsertDailyUsage(db: Warehouse, rows: AllDailyRow[]): Promise<number> {
  return upsertDailyRows(db, rows.map(r => ({
    date: r.date,
    agent: 'claude',
    project_path: null,
    session_count: 0,
    total_tokens: r.totalTokens,
    total_cost_usd: r.totalCost,
  })));
}
