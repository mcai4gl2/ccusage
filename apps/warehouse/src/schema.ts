// apps/warehouse/src/schema.ts

export const CREATE_SESSIONS = `
  CREATE TABLE IF NOT EXISTS sessions (
    session_id             TEXT PRIMARY KEY,
    agent                  TEXT NOT NULL,
    project_path           TEXT,
    repo_name              TEXT,
    branch                 TEXT,
    started_at             TIMESTAMP,
    ended_at               TIMESTAMP,
    duration_sec           BIGINT,
    model_set              TEXT,
    total_tokens           BIGINT,
    input_tokens           BIGINT,
    output_tokens          BIGINT,
    cache_creation_tokens  BIGINT,
    cache_read_tokens      BIGINT,
    reasoning_tokens       BIGINT,
    estimated_cost_usd     DOUBLE,
    imported_at            TIMESTAMP DEFAULT now()
  )`;

export const CREATE_PROJECTS = `
  CREATE TABLE IF NOT EXISTS projects (
    project_path     TEXT PRIMARY KEY,
    repo_name        TEXT,
    logical_project  TEXT,
    first_seen       TIMESTAMP,
    last_seen        TIMESTAMP
  )`;

export const CREATE_DAILY_USAGE = `
  CREATE TABLE IF NOT EXISTS daily_usage (
    date            DATE    NOT NULL,
    agent           TEXT    NOT NULL,
    project_path    TEXT,
    session_count   BIGINT,
    total_tokens    BIGINT,
    total_cost_usd  DOUBLE,
    PRIMARY KEY (date, agent)
  )`;

export const CREATE_ETL_STATE = `
  CREATE TABLE IF NOT EXISTS etl_state (
    source                    TEXT PRIMARY KEY,
    last_processed_timestamp  TEXT,
    last_processed_session    TEXT
  )`;

export const ALL_SCHEMAS = [
  CREATE_SESSIONS,
  CREATE_PROJECTS,
  CREATE_DAILY_USAGE,
  CREATE_ETL_STATE,
] as const;

export interface SessionRow {
  session_id: string;
  agent: string;
  project_path: string | null;
  repo_name: string | null;
  branch: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_sec: number | null;
  model_set: string | null;
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  reasoning_tokens: number;
  estimated_cost_usd: number;
}

export interface DailyUsageRow {
  date: string;
  agent: string;
  project_path: string | null;
  session_count: number;
  total_tokens: number;
  total_cost_usd: number;
}
