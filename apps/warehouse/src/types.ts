// apps/warehouse/src/types.ts

/** One session from `ccusage session --json` (Claude Code adapter). */
export interface CcusageSession {
  sessionId: string;
  projectPath: string;
  lastActivity: string;    // ISO 8601 timestamp string
  firstActivity: string;   // ISO 8601 timestamp string
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalCost: number;
  modelsUsed: string[];
}

export interface CcusageSessionResponse {
  sessions: CcusageSession[];
  totals: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    totalCost: number;
  };
}

/** One row from the `daily` array in `ccusage all --json`. */
export interface AllDailyRow {
  period: string;            // "YYYY-MM-DD"
  agent: string;             // "all" | "claude" | "codex" | "amp" | ...
  modelsUsed: string[];
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  totalCost: number;
  agentBreakdowns?: AllDailyRow[];
}

export interface AllDailyResponse {
  daily: AllDailyRow[];
  totals: {
    totalCost: number;
    totalTokens: number;
  };
}
