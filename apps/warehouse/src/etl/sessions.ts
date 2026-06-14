// apps/warehouse/src/etl/sessions.ts
import type { CcusageSession } from '../types.js';
import type { SessionRow } from '../schema.js';
import type { Warehouse } from '../db.js';

const SESSION_UPSERT_SQL = `
  INSERT INTO sessions
    (session_id, agent, project_path, repo_name, branch,
     started_at, ended_at, duration_sec, model_set,
     total_tokens, input_tokens, output_tokens,
     cache_creation_tokens, cache_read_tokens, reasoning_tokens,
     estimated_cost_usd)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT (session_id) DO UPDATE SET
    ended_at              = excluded.ended_at,
    duration_sec          = excluded.duration_sec,
    total_tokens          = excluded.total_tokens,
    input_tokens          = excluded.input_tokens,
    output_tokens         = excluded.output_tokens,
    cache_creation_tokens = excluded.cache_creation_tokens,
    cache_read_tokens     = excluded.cache_read_tokens,
    estimated_cost_usd    = excluded.estimated_cost_usd,
    model_set             = excluded.model_set`;

export async function upsertSessionRows(db: Warehouse, rows: SessionRow[]): Promise<number> {
  let count = 0;
  for (const r of rows) {
    await db.run(SESSION_UPSERT_SQL,
      r.session_id, r.agent, r.project_path, r.repo_name, r.branch,
      r.started_at, r.ended_at, r.duration_sec, r.model_set,
      r.total_tokens, r.input_tokens, r.output_tokens,
      r.cache_creation_tokens, r.cache_read_tokens, r.reasoning_tokens,
      r.estimated_cost_usd,
    );
    count++;
  }
  return count;
}
import { getGitMetadata } from '../enrichers/git.js';

function toSessionRow(s: CcusageSession): SessionRow {
  const git = getGitMetadata(s.projectPath);
  const startedAt = s.firstActivity ?? null;
  const endedAt = s.lastActivity ?? null;
  const durationSec =
    startedAt && endedAt
      ? Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000)
      : null;

  return {
    session_id: s.sessionId,
    agent: 'claude',
    project_path: s.projectPath ?? null,
    repo_name: git.repoName,
    branch: git.branch,
    started_at: startedAt,
    ended_at: endedAt,
    duration_sec: durationSec,
    model_set: s.modelsUsed.join(',') || null,
    total_tokens: s.inputTokens + s.outputTokens + s.cacheCreationTokens + s.cacheReadTokens,
    input_tokens: s.inputTokens,
    output_tokens: s.outputTokens,
    cache_creation_tokens: s.cacheCreationTokens,
    cache_read_tokens: s.cacheReadTokens,
    reasoning_tokens: 0,
    estimated_cost_usd: s.totalCost,
  };
}

export async function upsertSessions(db: Warehouse, sessions: CcusageSession[]): Promise<number> {
  return upsertSessionRows(db, sessions.map(toSessionRow));
}
