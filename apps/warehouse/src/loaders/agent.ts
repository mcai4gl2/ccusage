// apps/warehouse/src/loaders/agent.ts
import { spawnSync } from 'node:child_process';
import type {
  CodexSessionResponse, CodexDailyResponse,
  GenericAgentSessionResponse, GenericAgentDailyResponse,
} from '../types.js';
import type { SessionRow, DailyUsageRow } from '../schema.js';

export interface AgentLoaderOptions {
  ccusageBin?: string;
  since?: string; // YYYYMMDD
}

function spawnJson<T>(bin: string, args: string[]): T {
  const result = spawnSync(bin, args, { encoding: 'utf8', maxBuffer: 100 * 1024 * 1024 });
  if (result.error) throw new Error(`Failed to spawn ${bin}: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`ccusage exited ${result.status ?? 'null'}: ${result.stderr}`);
  return JSON.parse(result.stdout) as T;
}

export function loadAgentSessions(agent: string, opts: AgentLoaderOptions = {}): SessionRow[] {
  const bin = opts.ccusageBin ?? 'ccusage';
  const args = [agent, 'session', '--json'];
  if (opts.since) args.push('--since', opts.since);

  if (agent === 'codex') {
    const data = spawnJson<CodexSessionResponse>(bin, args);
    return (data.sessions ?? []).map(s => ({
      session_id: s.sessionId,
      agent,
      project_path: null,
      repo_name: null,
      branch: null,
      started_at: null,
      ended_at: s.lastActivity ?? null,
      duration_sec: null,
      model_set: Object.keys(s.models ?? {}).join(',') || null,
      total_tokens: s.totalTokens,
      input_tokens: s.inputTokens,
      output_tokens: s.outputTokens,
      cache_creation_tokens: s.cacheCreationTokens,
      cache_read_tokens: s.cacheReadTokens,
      reasoning_tokens: s.reasoningOutputTokens ?? 0,
      estimated_cost_usd: s.costUSD,
    }));
  }

  const data = spawnJson<GenericAgentSessionResponse>(bin, args);
  return (data.sessions ?? []).map(s => ({
    session_id: s.sessionId,
    agent,
    project_path: null,
    repo_name: null,
    branch: null,
    started_at: null,
    ended_at: null,
    duration_sec: null,
    model_set: (s.modelsUsed ?? []).join(',') || null,
    total_tokens: s.totalTokens,
    input_tokens: s.inputTokens,
    output_tokens: s.outputTokens,
    cache_creation_tokens: s.cacheCreationTokens,
    cache_read_tokens: s.cacheReadTokens,
    reasoning_tokens: 0,
    estimated_cost_usd: s.totalCost,
  }));
}

export function loadAgentDaily(agent: string, opts: AgentLoaderOptions = {}): DailyUsageRow[] {
  const bin = opts.ccusageBin ?? 'ccusage';
  const args = [agent, 'daily', '--json'];
  if (opts.since) args.push('--since', opts.since);

  if (agent === 'codex') {
    const data = spawnJson<CodexDailyResponse>(bin, args);
    return (data.daily ?? []).map(r => ({
      date: r.date,
      agent,
      project_path: null,
      session_count: 0,
      total_tokens: r.totalTokens,
      total_cost_usd: r.costUSD,
    }));
  }

  const data = spawnJson<GenericAgentDailyResponse>(bin, args);
  return (data.daily ?? []).map(r => ({
    date: r.date,
    agent,
    project_path: null,
    session_count: 0,
    total_tokens: r.totalTokens,
    total_cost_usd: r.totalCost,
  }));
}
