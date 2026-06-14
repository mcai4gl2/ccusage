// apps/warehouse/src/loaders/daily.ts
import { spawnSync } from 'node:child_process';
import type { AllDailyRow, AllDailyResponse } from '../types.js';

export interface DailyLoaderOptions {
  ccusageBin?: string;
  since?: string; // YYYYMMDD
}

export function loadDaily(opts: DailyLoaderOptions = {}): AllDailyRow[] {
  const bin = opts.ccusageBin ?? 'ccusage';
  const args = ['all', '--json'];
  if (opts.since) args.push('--since', opts.since);

  const result = spawnSync(bin, args, {
    encoding: 'utf8',
    maxBuffer: 100 * 1024 * 1024,
  });
  if (result.error) {
    throw new Error(`Failed to spawn ${bin}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`ccusage exited ${result.status ?? 'null'}: ${result.stderr}`);
  }
  const parsed = JSON.parse(result.stdout) as AllDailyResponse;
  return parsed.daily ?? [];
}
