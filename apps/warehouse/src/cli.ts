#!/usr/bin/env tsx
// apps/warehouse/src/cli.ts
import { sync } from './sync.js';
import { openWarehouse, defaultWarehousePath } from './db.js';

const [,, command, ...rest] = process.argv;

function flagValue(name: string): string | undefined {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : undefined;
}

function hasFlag(name: string): boolean {
  return rest.includes(name);
}

async function main(): Promise<void> {
  switch (command) {
    case 'sync': {
      await sync({
        dbPath: flagValue('--db'),
        ccusageBin: flagValue('--bin'),
        full: hasFlag('--full'),
      });
      break;
    }

    case 'stats': {
      const dbPath = flagValue('--db') ?? defaultWarehousePath();
      const db = await openWarehouse(dbPath);
      try {
        const [sessions] = await db.query<{ count: number }>(
          'SELECT count(*) AS count FROM sessions',
        );
        const [daily] = await db.query<{ count: number }>(
          'SELECT count(*) AS count FROM daily_usage',
        );
        const [repos] = await db.query<{ count: number }>(
          'SELECT count(*) AS count FROM projects',
        );
        const [cost] = await db.query<{ total: number | null }>(
          'SELECT sum(estimated_cost_usd) AS total FROM sessions',
        );
        console.log(`Sessions  : ${sessions!.count}`);
        console.log(`Daily rows: ${daily!.count}`);
        console.log(`Repos     : ${repos!.count}`);
        console.log(`Total cost: $${(cost!.total ?? 0).toFixed(4)}`);
      } finally {
        await db.close();
      }
      break;
    }

    case 'query': {
      const sql = rest.find(a => !a.startsWith('--'));
      if (!sql) {
        console.error('Usage: ccusage-warehouse query [--db <path>] "<sql>"');
        process.exit(1);
      }
      const dbPath = flagValue('--db') ?? defaultWarehousePath();
      const db = await openWarehouse(dbPath);
      try {
        const rows = await db.query(sql);
        console.log(JSON.stringify(rows, null, 2));
      } finally {
        await db.close();
      }
      break;
    }

    case 'export': {
      const format = rest.find(a => a === 'csv' || a === 'parquet' || a === 'json') ?? 'csv';
      const out = flagValue('--output') ?? `ccusage-sessions.${format}`;
      const dbPath = flagValue('--db') ?? defaultWarehousePath();
      const db = await openWarehouse(dbPath);
      try {
        if (format === 'json') {
          const rows = await db.query('SELECT * FROM sessions ORDER BY started_at');
          const fs = await import('node:fs');
          fs.writeFileSync(out, JSON.stringify(rows, null, 2));
        } else {
          await db.run(`COPY sessions TO '${out}' (FORMAT ${format.toUpperCase()})`);
        }
        console.log(`Exported sessions → ${out}`);
      } finally {
        await db.close();
      }
      break;
    }

    default:
      console.log(`ccusage-warehouse — AI usage analytics warehouse

Usage: ccusage-warehouse <command> [options]

Commands:
  sync   [--db <path>] [--bin <ccusage>] [--full]
         Load ccusage data into the warehouse (incremental by default).

  stats  [--db <path>]
         Print summary stats from the warehouse.

  query  [--db <path>] "<sql>"
         Run ad-hoc SQL against the warehouse and print JSON.

  export [--db <path>] [--output <file>] csv|parquet|json
         Export the sessions table. DuckDB handles csv and parquet natively.

Examples:
  ccusage-warehouse sync --full
  ccusage-warehouse stats
  ccusage-warehouse query "SELECT * FROM v_cost_by_repo LIMIT 10"
  ccusage-warehouse export parquet --output sessions.parquet
`);
  }
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
