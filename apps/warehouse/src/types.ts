// apps/warehouse/src/types.ts

/** One session from `ccusage claude session --json`. */
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

/** One row from the `daily` array in `ccusage claude daily --json`. */
export interface AllDailyRow {
  date: string;              // "YYYY-MM-DD"
  modelsUsed: string[];
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  totalCost: number;
}

export interface AllDailyResponse {
  daily: AllDailyRow[];
  totals: {
    totalCost: number;
    totalTokens: number;
  };
}

/** One session from `ccusage codex session --json`. */
export interface CodexSession {
  sessionId: string;
  directory: string;
  lastActivity: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  reasoningOutputTokens: number;
  totalTokens: number;
  costUSD: number;
  models: Record<string, unknown>;
  sessionFile: string;
}

export interface CodexSessionResponse {
  sessions: CodexSession[];
}

export interface CodexDailyRow {
  date: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  reasoningOutputTokens: number;
  totalTokens: number;
  costUSD: number;
  models: Record<string, unknown>;
}

export interface CodexDailyResponse {
  daily: CodexDailyRow[];
}

/** Session shape shared by opencode, gemini, and similar agents. */
export interface GenericAgentSession {
  sessionId: string;
  modelsUsed: string[];
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  totalCost: number;
}

export interface GenericAgentSessionResponse {
  sessions: GenericAgentSession[];
}

export interface GenericAgentDailyRow {
  date: string;
  modelsUsed: string[];
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  totalCost: number;
}

export interface GenericAgentDailyResponse {
  daily: GenericAgentDailyRow[];
}
