// apps/warehouse/src/loaders/sessions.ts
import { spawnSync } from 'node:child_process';
import type { CcusageSession, CcusageSessionResponse } from '../types.js';

export interface SessionLoaderOptions {
  ccusageBin?: string;
  since?: string; // YYYYMMDD — matches ccusage --since format
}

export function loadSessions(opts: SessionLoaderOptions = {}): CcusageSession[] {
  const bin = opts.ccusageBin ?? 'ccusage';
  const args = ['claude', 'session', '--json'];
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
  const parsed = JSON.parse(result.stdout) as CcusageSessionResponse;
  return parsed.sessions ?? [];
}
