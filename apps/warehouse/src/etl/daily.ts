// apps/warehouse/src/etl/daily.ts
import type { AllDailyRow } from '../types.js';
import type { DailyUsageRow } from '../schema.js';
import type { Warehouse } from '../db.js';

function flattenDailyRow(row: AllDailyRow): DailyUsageRow[] {
  if (row.agentBreakdowns && row.agentBreakdowns.length > 0) {
    return row.agentBreakdowns.map(b => ({
      date: b.period,
      agent: b.agent,
      project_path: null,
      session_count: 0,
      total_tokens: b.totalTokens,
      total_cost_usd: b.totalCost,
    }));
  }
  if (row.agent !== 'all') {
    return [{
      date: row.period,
      agent: row.agent,
      project_path: null,
      session_count: 0,
      total_tokens: row.totalTokens,
      total_cost_usd: row.totalCost,
    }];
  }
  return [];
}

export async function upsertDailyUsage(db: Warehouse, rows: AllDailyRow[]): Promise<number> {
  let count = 0;
  for (const row of rows) {
    for (const usage of flattenDailyRow(row)) {
      await db.run(
        `INSERT INTO daily_usage (date, agent, project_path, session_count, total_tokens, total_cost_usd)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (date, agent) DO UPDATE SET
           total_tokens   = excluded.total_tokens,
           total_cost_usd = excluded.total_cost_usd`,
        usage.date, usage.agent, usage.project_path,
        usage.session_count, usage.total_tokens, usage.total_cost_usd,
      );
      count++;
    }
  }
  return count;
}
