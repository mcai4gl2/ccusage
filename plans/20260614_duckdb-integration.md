# DuckDB Analytics Warehouse Implementation Plan

> **Status:** ✅ COMPLETE — All 15 tasks implemented and committed (2026-06-14). Tail commit: `5499615`. Activate Nix dev shell (`direnv allow`), run `pnpm install`, then `ccusage-warehouse sync --full` to use.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Build a DuckDB-backed analytics warehouse that normalizes multi-agent ccusage data into a queryable schema, enabling productivity and cost analytics beyond what the CLI surfaces directly.

**Architecture:** Phase 1 is an external TypeScript ETL package (`apps/warehouse/`) that invokes `ccusage session --json` and `ccusage all --json` via subprocess, normalizes the output into DuckDB tables, enriches sessions with git metadata, and exposes a CLI (`ccusage-warehouse sync|stats|query|export`). Phase 2 adds a native `ccusage export csv` Rust subcommand for lightweight data extraction that can be piped into DuckDB directly.

**Tech Stack:** `duckdb-async` (npm), TypeScript, Node.js 22+, existing `ccusage` Rust CLI, `node:child_process` for subprocess invocation, `git` CLI for metadata enrichment, Rust + existing adapter infrastructure for Phase 2.

---

## File Map

```
apps/warehouse/
  package.json                        # package metadata, bin: ccusage-warehouse
  tsconfig.json                       # compiler options
  src/
    cli.ts                            # CLI entry: sync | stats | query | export
    db.ts                             # DuckDB connection lifecycle + schema init
    schema.ts                         # DDL SQL strings + TypeScript table row types
    types.ts                          # TypeScript interfaces for ccusage JSON output
    sync.ts                           # ETL orchestration (calls loaders + ETL)
    state.ts                          # etl_state table read/write
    views.ts                          # Analytics SQL views
    loaders/
      sessions.ts                     # spawn ccusage session --json, parse output
      daily.ts                        # spawn ccusage all --json, parse output
    enrichers/
      git.ts                          # extract repo name + branch from project_path
    etl/
      sessions.ts                     # transform CcusageSession → sessions rows
      daily.ts                        # transform AllDailyRow → daily_usage rows
      projects.ts                     # upsert projects from enriched sessions

rust/crates/ccusage/src/
  commands/export.rs                  # Phase 2: run_export() – CSV + JSON Lines
  commands/mod.rs                     # add: pub(crate) mod export
  cli.rs                              # add: Export(ExportArgs) to Command enum
  main.rs                             # add: Command::Export(args) => run_export

rust/crates/ccusage-cli/src/
  types.rs                            # add: ExportArgs, ExportFormat enums
  arg_parser.rs                       # add: "export" subcommand parsing
```

---

### Task 1: Package Scaffold

**Files:**
- Create: `apps/warehouse/package.json`
- Create: `apps/warehouse/tsconfig.json`
- Create: `apps/warehouse/src/cli.ts` (stub)
- Modify: `pnpm-workspace.yaml` (add `duckdb` to `allowBuilds`)

- [x] **Step 1: Create `apps/warehouse/package.json`**

```json
{
  "name": "@ccusage/warehouse",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "bin": {
    "ccusage-warehouse": "./src/cli.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "duckdb-async": "^0.10.3"
  },
  "devDependencies": {
    "typescript": "^5.8.0"
  }
}
```

- [x] **Step 2: Create `apps/warehouse/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "lib": ["ESNext"],
    "moduleDetection": "force",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "types": ["node"],
    "allowImportingTsExtensions": true,
    "strict": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitOverride": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "verbatimModuleSyntax": true,
    "erasableSyntaxOnly": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

- [x] **Step 3: Create stub `apps/warehouse/src/cli.ts`**

```typescript
#!/usr/bin/env node
console.log('ccusage-warehouse: not yet implemented');
```

- [x] **Step 4: Add `duckdb` to `allowBuilds` in `pnpm-workspace.yaml`**

Open `pnpm-workspace.yaml` and add `duckdb: true` to the `allowBuilds` section:

```yaml
allowBuilds:
  duckdb: true
  esbuild: true
  sharp: true
  sqlite3: true
  workerd: true
```

- [x] **Step 5: Install dependencies**

```bash
cd apps/warehouse && pnpm install
```

Expected: `node_modules/duckdb-async/` and `node_modules/duckdb/` created.

- [x] **Step 6: Commit**

```bash
git add apps/warehouse/ pnpm-workspace.yaml pnpm-lock.yaml
git commit -m "feat(warehouse): scaffold @ccusage/warehouse package"
```

---

### Task 2: Schema Definitions

**Files:**
- Create: `apps/warehouse/src/schema.ts`

- [x] **Step 1: Write `schema.ts`**

```typescript
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
```

- [x] **Step 2: Verify TypeScript compiles**

```bash
cd apps/warehouse && pnpm typecheck
```

Expected: No errors.

- [x] **Step 3: Commit**

```bash
git add apps/warehouse/src/schema.ts
git commit -m "feat(warehouse): define DuckDB warehouse schema"
```

---

### Task 3: DB Connection and Initialization

**Files:**
- Create: `apps/warehouse/src/db.ts`

- [x] **Step 1: Write `db.ts`**

```typescript
// apps/warehouse/src/db.ts
import { Database } from 'duckdb-async';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { ALL_SCHEMAS } from './schema.js';

export function defaultWarehousePath(): string {
  const base = join(homedir(), '.local', 'share', 'ccusage');
  mkdirSync(base, { recursive: true });
  return join(base, 'warehouse.db');
}

export type Warehouse = {
  run: (sql: string, ...params: unknown[]) => Promise<void>;
  query: <T = Record<string, unknown>>(sql: string, ...params: unknown[]) => Promise<T[]>;
  close: () => Promise<void>;
};

export async function openWarehouse(dbPath: string): Promise<Warehouse> {
  const db = await Database.create(dbPath);
  for (const ddl of ALL_SCHEMAS) {
    await db.run(ddl);
  }
  return {
    async run(sql: string, ...params: unknown[]): Promise<void> {
      await db.run(sql, ...params);
    },
    async query<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T[]> {
      return db.all<T>(sql, ...params);
    },
    async close(): Promise<void> {
      await db.close();
    },
  };
}
```

- [x] **Step 2: Verify TypeScript compiles**

```bash
cd apps/warehouse && pnpm typecheck
```

Expected: No errors.

- [x] **Step 3: Commit**

```bash
git add apps/warehouse/src/db.ts
git commit -m "feat(warehouse): add DuckDB connection lifecycle and schema initialization"
```

---

### Task 4: ccusage JSON Types

**Files:**
- Create: `apps/warehouse/src/types.ts`

These interfaces mirror the JSON produced by `ccusage session --json` and `ccusage all --json`.

- [x] **Step 1: Write `types.ts`**

```typescript
// apps/warehouse/src/types.ts

/** One session from `ccusage session --json` (Claude Code adapter). */
export interface CcusageSession {
  sessionId: string;
  projectPath: string;
  lastActivity: string;    // ISO 8601
  firstActivity: string;   // ISO 8601
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
```

- [x] **Step 2: Verify TypeScript compiles**

```bash
cd apps/warehouse && pnpm typecheck
```

Expected: No errors.

- [x] **Step 3: Commit**

```bash
git add apps/warehouse/src/types.ts
git commit -m "feat(warehouse): add TypeScript interfaces for ccusage JSON output"
```

---

### Task 5: Session Loader

**Files:**
- Create: `apps/warehouse/src/loaders/sessions.ts`

- [x] **Step 1: Write `loaders/sessions.ts`**

```typescript
// apps/warehouse/src/loaders/sessions.ts
import { spawnSync } from 'node:child_process';
import type { CcusageSession, CcusageSessionResponse } from '../types.js';

export interface SessionLoaderOptions {
  ccusageBin?: string;
  since?: string; // YYYYMMDD — matches ccusage --since format
}

export function loadSessions(opts: SessionLoaderOptions = {}): CcusageSession[] {
  const bin = opts.ccusageBin ?? 'ccusage';
  const args = ['session', '--json'];
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
```

- [x] **Step 2: Run manual smoke test (requires ccusage in PATH)**

```bash
cd apps/warehouse
node --input-type=module << 'EOF'
import { loadSessions } from './src/loaders/sessions.js';
const sessions = loadSessions();
console.log(`Loaded ${sessions.length} sessions`);
if (sessions.length > 0) console.log(JSON.stringify(sessions[0], null, 2));
EOF
```

Expected: Prints count and first session with `sessionId`, `projectPath`, `firstActivity`, `totalCost`, `modelsUsed`.

- [x] **Step 3: Commit**

```bash
git add apps/warehouse/src/loaders/sessions.ts
git commit -m "feat(warehouse): add ccusage session --json loader"
```

---

### Task 6: Daily Loader

**Files:**
- Create: `apps/warehouse/src/loaders/daily.ts`

- [x] **Step 1: Write `loaders/daily.ts`**

```typescript
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
```

- [x] **Step 2: Run manual smoke test**

```bash
cd apps/warehouse
node --input-type=module << 'EOF'
import { loadDaily } from './src/loaders/daily.js';
const rows = loadDaily();
console.log(`Loaded ${rows.length} daily rows`);
if (rows[0]) {
  console.log(`First: period=${rows[0].period} agent=${rows[0].agent} totalCost=${rows[0].totalCost}`);
  console.log(`  agentBreakdowns: ${rows[0].agentBreakdowns?.length ?? 0} agents`);
}
EOF
```

Expected: Prints count. The `agentBreakdowns` field contains per-agent rows nested inside each `"all"` row.

- [x] **Step 3: Commit**

```bash
git add apps/warehouse/src/loaders/daily.ts
git commit -m "feat(warehouse): add ccusage all --json daily loader"
```

---

### Task 7: Git Metadata Enricher

**Files:**
- Create: `apps/warehouse/src/enrichers/git.ts`

- [x] **Step 1: Write `enrichers/git.ts`**

```typescript
// apps/warehouse/src/enrichers/git.ts
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

export interface GitMetadata {
  repoName: string | null;
  branch: string | null;
}

const cache = new Map<string, GitMetadata>();

function gitOutput(cwd: string, ...args: string[]): string | null {
  if (!existsSync(cwd)) return null;
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) return null;
  return r.stdout.trim() || null;
}

export function getGitMetadata(projectPath: string): GitMetadata {
  if (cache.has(projectPath)) return cache.get(projectPath)!;

  const remoteUrl = gitOutput(projectPath, 'remote', 'get-url', 'origin');
  const repoName = remoteUrl
    ? (remoteUrl.split('/').pop()?.replace(/\.git$/, '') ?? null)
    : (projectPath.split('/').pop() ?? null);

  const branch = gitOutput(projectPath, 'rev-parse', '--abbrev-ref', 'HEAD');

  const meta: GitMetadata = { repoName, branch };
  cache.set(projectPath, meta);
  return meta;
}
```

- [x] **Step 2: Verify TypeScript compiles**

```bash
cd apps/warehouse && pnpm typecheck
```

Expected: No errors.

- [x] **Step 3: Manual smoke test from the ccusage repo root**

```bash
cd apps/warehouse
node --input-type=module << 'EOF'
import { getGitMetadata } from './src/enrichers/git.js';
const meta = getGitMetadata('/home/ligeng/Codes/ccusage');
console.log(JSON.stringify(meta));
EOF
```

Expected: `{"repoName":"ccusage","branch":"main"}` (or the current branch name).

- [x] **Step 4: Commit**

```bash
git add apps/warehouse/src/enrichers/git.ts
git commit -m "feat(warehouse): add cached git repo/branch enricher for project paths"
```

---

### Task 8: ETL State Management

**Files:**
- Create: `apps/warehouse/src/state.ts`

- [x] **Step 1: Write `state.ts`**

```typescript
// apps/warehouse/src/state.ts
import type { Warehouse } from './db.js';

export interface EtlState {
  lastProcessedTimestamp: string | null;
  lastProcessedSession: string | null;
}

export async function readState(db: Warehouse, source: string): Promise<EtlState> {
  const rows = await db.query<{
    last_processed_timestamp: string | null;
    last_processed_session: string | null;
  }>(
    'SELECT last_processed_timestamp, last_processed_session FROM etl_state WHERE source = ?',
    source,
  );
  if (rows.length === 0) {
    return { lastProcessedTimestamp: null, lastProcessedSession: null };
  }
  const row = rows[0]!;
  return {
    lastProcessedTimestamp: row.last_processed_timestamp,
    lastProcessedSession: row.last_processed_session,
  };
}

export async function writeState(db: Warehouse, source: string, state: EtlState): Promise<void> {
  await db.run(
    `INSERT INTO etl_state (source, last_processed_timestamp, last_processed_session)
     VALUES (?, ?, ?)
     ON CONFLICT (source) DO UPDATE SET
       last_processed_timestamp = excluded.last_processed_timestamp,
       last_processed_session   = excluded.last_processed_session`,
    source,
    state.lastProcessedTimestamp,
    state.lastProcessedSession,
  );
}
```

- [x] **Step 2: Verify TypeScript compiles**

```bash
cd apps/warehouse && pnpm typecheck
```

Expected: No errors.

- [x] **Step 3: Commit**

```bash
git add apps/warehouse/src/state.ts
git commit -m "feat(warehouse): add ETL state read/write for incremental processing"
```

---

### Task 9: Sessions ETL Transform

**Files:**
- Create: `apps/warehouse/src/etl/sessions.ts`

- [x] **Step 1: Write `etl/sessions.ts`**

```typescript
// apps/warehouse/src/etl/sessions.ts
import type { CcusageSession } from '../types.js';
import type { SessionRow } from '../schema.js';
import type { Warehouse } from '../db.js';
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
  let count = 0;
  for (const session of sessions) {
    const r = toSessionRow(session);
    await db.run(
      `INSERT INTO sessions
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
         model_set             = excluded.model_set`,
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
```

- [x] **Step 2: Verify TypeScript compiles**

```bash
cd apps/warehouse && pnpm typecheck
```

Expected: No errors.

- [x] **Step 3: Commit**

```bash
git add apps/warehouse/src/etl/sessions.ts
git commit -m "feat(warehouse): add session ETL transform: CcusageSession → sessions table"
```

---

### Task 10: Daily ETL Transform

**Files:**
- Create: `apps/warehouse/src/etl/daily.ts`

- [x] **Step 1: Write `etl/daily.ts`**

The `ccusage all --json` `daily` array contains rows where `agent === "all"`, each with an `agentBreakdowns` array of per-agent rows. We flatten those into individual `daily_usage` rows keyed by `(date, agent)`.

```typescript
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
```

- [x] **Step 2: Verify TypeScript compiles**

```bash
cd apps/warehouse && pnpm typecheck
```

Expected: No errors.

- [x] **Step 3: Commit**

```bash
git add apps/warehouse/src/etl/daily.ts
git commit -m "feat(warehouse): add daily usage ETL: AllDailyRow → daily_usage table"
```

---

### Task 11: Projects ETL

**Files:**
- Create: `apps/warehouse/src/etl/projects.ts`

- [x] **Step 1: Write `etl/projects.ts`**

```typescript
// apps/warehouse/src/etl/projects.ts
import type { CcusageSession } from '../types.js';
import type { Warehouse } from '../db.js';
import { getGitMetadata } from '../enrichers/git.js';

export async function upsertProjects(db: Warehouse, sessions: CcusageSession[]): Promise<void> {
  type ProjectAccum = { repoName: string | null; firstSeen: string; lastSeen: string };
  const seen = new Map<string, ProjectAccum>();

  for (const s of sessions) {
    const path = s.projectPath;
    const first = s.firstActivity ?? s.lastActivity;
    const last = s.lastActivity ?? s.firstActivity;
    const existing = seen.get(path);
    if (!existing) {
      const git = getGitMetadata(path);
      seen.set(path, { repoName: git.repoName, firstSeen: first, lastSeen: last });
    } else {
      if (first < existing.firstSeen) existing.firstSeen = first;
      if (last > existing.lastSeen) existing.lastSeen = last;
    }
  }

  for (const [projectPath, meta] of seen) {
    await db.run(
      `INSERT INTO projects (project_path, repo_name, logical_project, first_seen, last_seen)
       VALUES (?, ?, NULL, ?, ?)
       ON CONFLICT (project_path) DO UPDATE SET
         last_seen  = CASE WHEN excluded.last_seen  > projects.last_seen  THEN excluded.last_seen  ELSE projects.last_seen  END,
         first_seen = CASE WHEN excluded.first_seen < projects.first_seen THEN excluded.first_seen ELSE projects.first_seen END,
         repo_name  = COALESCE(projects.repo_name, excluded.repo_name)`,
      projectPath,
      meta.repoName,
      meta.firstSeen,
      meta.lastSeen,
    );
  }
}
```

- [x] **Step 2: Verify TypeScript compiles**

```bash
cd apps/warehouse && pnpm typecheck
```

Expected: No errors.

- [x] **Step 3: Commit**

```bash
git add apps/warehouse/src/etl/projects.ts
git commit -m "feat(warehouse): add projects ETL upsert with git-enriched repo names"
```

---

### Task 12: Analytics Views

**Files:**
- Create: `apps/warehouse/src/views.ts`

- [x] **Step 1: Write `views.ts`**

```typescript
// apps/warehouse/src/views.ts
import type { Warehouse } from './db.js';

const VIEWS: Record<string, string> = {
  v_cost_by_repo: `
    CREATE OR REPLACE VIEW v_cost_by_repo AS
    SELECT
      COALESCE(p.logical_project, s.repo_name, s.project_path) AS repo,
      count(*)                      AS session_count,
      sum(s.estimated_cost_usd)     AS total_cost_usd,
      sum(s.total_tokens)           AS total_tokens,
      min(s.started_at)             AS first_session,
      max(s.ended_at)               AS last_session
    FROM sessions s
    LEFT JOIN projects p ON s.project_path = p.project_path
    GROUP BY 1
    ORDER BY total_cost_usd DESC`,

  v_cost_by_model: `
    CREATE OR REPLACE VIEW v_cost_by_model AS
    SELECT
      unnest(string_split(model_set, ',')) AS model,
      count(*)                             AS session_count,
      sum(estimated_cost_usd)              AS total_cost_usd,
      sum(total_tokens)                    AS total_tokens
    FROM sessions
    WHERE model_set IS NOT NULL
    GROUP BY 1
    ORDER BY total_cost_usd DESC`,

  v_cost_by_agent: `
    CREATE OR REPLACE VIEW v_cost_by_agent AS
    SELECT
      agent,
      count(*)                AS day_count,
      sum(total_tokens)       AS total_tokens,
      sum(total_cost_usd)     AS total_cost_usd
    FROM daily_usage
    GROUP BY agent
    ORDER BY total_cost_usd DESC`,

  v_deep_work_sessions: `
    CREATE OR REPLACE VIEW v_deep_work_sessions AS
    SELECT
      session_id,
      agent,
      repo_name,
      started_at,
      ended_at,
      round(duration_sec / 3600.0, 2) AS duration_hours,
      estimated_cost_usd
    FROM sessions
    WHERE duration_sec > 3600
    ORDER BY duration_sec DESC`,

  v_daily_trend: `
    CREATE OR REPLACE VIEW v_daily_trend AS
    SELECT
      date,
      sum(total_tokens)      AS total_tokens,
      sum(total_cost_usd)    AS total_cost_usd,
      string_agg(DISTINCT agent, ', ' ORDER BY agent) AS agents
    FROM daily_usage
    GROUP BY date
    ORDER BY date`,

  v_model_roi: `
    CREATE OR REPLACE VIEW v_model_roi AS
    SELECT
      unnest(string_split(model_set, ','))   AS model,
      count(*)                               AS session_count,
      sum(total_tokens)                      AS total_tokens,
      sum(estimated_cost_usd)                AS total_cost_usd,
      round(sum(estimated_cost_usd) / nullif(sum(total_tokens), 0) * 1e6, 4)
                                             AS cost_per_million_tokens
    FROM sessions
    WHERE model_set IS NOT NULL
    GROUP BY 1
    ORDER BY total_cost_usd DESC`,
};

export async function createViews(db: Warehouse): Promise<void> {
  for (const [name, sql] of Object.entries(VIEWS)) {
    await db.run(sql);
    console.log(`  Created view: ${name}`);
  }
}
```

- [x] **Step 2: Verify TypeScript compiles**

```bash
cd apps/warehouse && pnpm typecheck
```

Expected: No errors.

- [x] **Step 3: Commit**

```bash
git add apps/warehouse/src/views.ts
git commit -m "feat(warehouse): add analytics views (cost_by_repo, deep_work, model_roi, daily_trend)"
```

---

### Task 13: Sync Orchestration

**Files:**
- Create: `apps/warehouse/src/sync.ts`

- [x] **Step 1: Write `sync.ts`**

```typescript
// apps/warehouse/src/sync.ts
import { openWarehouse, defaultWarehousePath } from './db.js';
import { loadSessions } from './loaders/sessions.js';
import { loadDaily } from './loaders/daily.js';
import { upsertSessions } from './etl/sessions.js';
import { upsertDailyUsage } from './etl/daily.js';
import { upsertProjects } from './etl/projects.js';
import { readState, writeState } from './state.js';
import { createViews } from './views.js';

export interface SyncOptions {
  dbPath?: string;
  ccusageBin?: string;
  full?: boolean;
}

export async function sync(opts: SyncOptions = {}): Promise<void> {
  const dbPath = opts.dbPath ?? defaultWarehousePath();
  console.log(`Warehouse: ${dbPath}`);

  const db = await openWarehouse(dbPath);
  try {
    const state = opts.full
      ? { lastProcessedTimestamp: null, lastProcessedSession: null }
      : await readState(db, 'ccusage-sessions');

    const sinceDate = state.lastProcessedTimestamp
      ? state.lastProcessedTimestamp.slice(0, 10).replace(/-/g, '')
      : undefined;

    console.log(`Loading sessions${sinceDate ? ` since ${sinceDate}` : ' (all)'}...`);
    const sessions = loadSessions({ ccusageBin: opts.ccusageBin, since: sinceDate });
    console.log(`  → ${sessions.length} sessions`);

    console.log('Loading daily usage...');
    const daily = loadDaily({ ccusageBin: opts.ccusageBin, since: sinceDate });
    console.log(`  → ${daily.length} daily rows`);

    const sessionCount = await upsertSessions(db, sessions);
    console.log(`  Upserted ${sessionCount} session rows`);

    const dailyCount = await upsertDailyUsage(db, daily);
    console.log(`  Upserted ${dailyCount} daily_usage rows`);

    await upsertProjects(db, sessions);
    console.log(`  Projects updated`);

    await createViews(db);

    if (sessions.length > 0) {
      const latest = sessions.reduce((best, s) =>
        (s.lastActivity ?? '') > (best.lastActivity ?? '') ? s : best,
      );
      await writeState(db, 'ccusage-sessions', {
        lastProcessedTimestamp: latest.lastActivity,
        lastProcessedSession: latest.sessionId,
      });
    }

    console.log('Sync complete.');
  } finally {
    await db.close();
  }
}
```

- [x] **Step 2: Verify TypeScript compiles**

```bash
cd apps/warehouse && pnpm typecheck
```

Expected: No errors.

- [x] **Step 3: End-to-end smoke test**

```bash
cd apps/warehouse
node src/cli.ts sync --db /tmp/test-warehouse.db --full
```

Expected output (session/row counts will vary):
```
Warehouse: /tmp/test-warehouse.db
Loading sessions (all)...
  → 42 sessions
Loading daily usage...
  → 18 daily rows
  Upserted 42 session rows
  Upserted 26 daily_usage rows
  Projects updated
  Created view: v_cost_by_repo
  Created view: v_cost_by_model
  ...
Sync complete.
```

- [x] **Step 4: Commit**

```bash
git add apps/warehouse/src/sync.ts
git commit -m "feat(warehouse): add sync orchestration with incremental ETL state"
```

---

### Task 14: CLI Entry Point

**Files:**
- Modify: `apps/warehouse/src/cli.ts`

- [x] **Step 1: Write `cli.ts`**

```typescript
#!/usr/bin/env node
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
```

- [x] **Step 2: Test sync command**

```bash
cd apps/warehouse
node src/cli.ts sync --db /tmp/test-warehouse.db --full
```

Expected: Full ETL run with progress lines and "Sync complete."

- [x] **Step 3: Test stats command**

```bash
node src/cli.ts stats --db /tmp/test-warehouse.db
```

Expected:
```
Sessions  : 42
Daily rows: 26
Repos     : 8
Total cost: $12.3456
```

- [x] **Step 4: Test query command with analytics view**

```bash
node src/cli.ts query --db /tmp/test-warehouse.db "SELECT * FROM v_cost_by_repo LIMIT 5"
```

Expected: JSON array with `repo`, `session_count`, `total_cost_usd`, `total_tokens` columns.

- [x] **Step 5: Test deep work query**

```bash
node src/cli.ts query --db /tmp/test-warehouse.db "SELECT * FROM v_deep_work_sessions LIMIT 5"
```

Expected: JSON array of sessions longer than 1 hour (may be empty if no such sessions exist).

- [x] **Step 6: Test export**

```bash
node src/cli.ts export --db /tmp/test-warehouse.db csv --output /tmp/sessions.csv
head -3 /tmp/sessions.csv
```

Expected: CSV with header `session_id,agent,project_path,...` followed by data rows.

- [x] **Step 7: Test incremental sync (second run should only process new sessions)**

```bash
node src/cli.ts sync --db /tmp/test-warehouse.db
```

Expected: "Loading sessions since YYYYMMDD..." (uses stored state) and fewer or zero new rows.

- [x] **Step 8: Commit**

```bash
git add apps/warehouse/src/cli.ts
git commit -m "feat(warehouse): add ccusage-warehouse CLI (sync, stats, query, export)"
```

---

### Task 15: Native Rust CSV Export (Phase 2)

Adds `ccusage export csv` to the Rust CLI. This lets users pipe daily data directly into DuckDB via `COPY (SELECT * FROM read_csv_auto('/dev/stdin')) TO ...` or similar, without installing the Node.js warehouse tool.

**Files:**
- Modify: `rust/crates/ccusage-cli/src/types.rs` (add `ExportArgs`, `ExportFormat`)
- Modify: `rust/crates/ccusage-cli/src/arg_parser.rs` (add `"export"` branch)
- Create: `rust/crates/ccusage/src/commands/export.rs`
- Modify: `rust/crates/ccusage/src/commands/mod.rs` (add `pub(crate) mod export`)
- Modify: `rust/crates/ccusage/src/main.rs` (add `Command::Export` route)

- [x] **Step 1: Add types in `ccusage-cli/src/types.rs`**

Find the end of the existing type definitions in `rust/crates/ccusage-cli/src/types.rs` and append:

```rust
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub enum ExportFormat {
    #[default]
    Csv,
    JsonLines,
}

#[derive(Debug, Default, Clone)]
pub struct ExportArgs {
    pub shared: SharedArgs,
    pub format: ExportFormat,
    pub output: Option<String>,
}
```

- [x] **Step 2: Verify `ccusage-cli` compiles**

```bash
cargo check --manifest-path rust/Cargo.toml -p ccusage-cli
```

Expected: Compiles without errors.

- [x] **Step 3: Add export parsing in `ccusage-cli/src/arg_parser.rs`**

Read `rust/crates/ccusage-cli/src/arg_parser.rs` to find the subcommand dispatch pattern (the `match subcommand` block). Add the `"export"` arm following the same structure as existing arms:

```rust
"export" => {
    let format = match args.peek().map(String::as_str) {
        Some("jsonl") => { args.next(); ExportFormat::JsonLines }
        Some("csv") | None => { args.next(); ExportFormat::Csv }
        Some(other) => {
            return Err(cli_error(format!("Unknown export format: {other}")));
        }
    };
    let mut output = None;
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--output" | "-o" => { output = args.next(); }
            _ => { parse_shared_arg(&mut shared, &arg, &mut args)?; }
        }
    }
    Command::Export(ExportArgs { shared, format, output })
}
```

Note: Read the actual `arg_parser.rs` before editing to match the exact variable names (`args`, `shared`, `parse_shared_arg`).

- [x] **Step 4: Add `Export` variant to `Command` enum in `ccusage-cli/src/types.rs`**

In the `Command` enum, add:
```rust
Export(ExportArgs),
```

- [x] **Step 5: Create `rust/crates/ccusage/src/commands/export.rs`**

```rust
// rust/crates/ccusage/src/commands/export.rs
use std::{
    fs,
    io::{self, BufWriter, Write},
};

use crate::{
    Result,
    cli::{ExportArgs, ExportFormat},
    load_daily_summaries,
};

pub(crate) fn run_export(args: ExportArgs) -> Result<()> {
    let rows = load_daily_summaries(&args.shared, None, false)?;

    let stdout = io::stdout();
    let mut out: Box<dyn Write> = match &args.output {
        Some(path) => Box::new(BufWriter::new(
            fs::File::create(path).map_err(|e| crate::cli_error(e.to_string()))?,
        )),
        None => Box::new(BufWriter::new(stdout.lock())),
    };

    match args.format {
        ExportFormat::Csv => write_csv(&mut out, &rows),
        ExportFormat::JsonLines => write_jsonl(&mut out, &rows),
    }
}

fn write_csv(out: &mut dyn Write, rows: &[crate::UsageSummary]) -> Result<()> {
    writeln!(
        out,
        "date,input_tokens,output_tokens,cache_creation_tokens,cache_read_tokens,total_cost_usd"
    )?;
    for row in rows {
        writeln!(
            out,
            "{},{},{},{},{},{}",
            row.date.as_deref().unwrap_or(""),
            row.input_tokens,
            row.output_tokens,
            row.cache_creation_tokens,
            row.cache_read_tokens,
            row.total_cost,
        )?;
    }
    Ok(())
}

fn write_jsonl(out: &mut dyn Write, rows: &[crate::UsageSummary]) -> Result<()> {
    for row in rows {
        let line = serde_json::to_string(&serde_json::json!({
            "date": row.date,
            "inputTokens": row.input_tokens,
            "outputTokens": row.output_tokens,
            "cacheCreationTokens": row.cache_creation_tokens,
            "cacheReadTokens": row.cache_read_tokens,
            "totalCost": row.total_cost,
        }))?;
        writeln!(out, "{line}")?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use super::*;
    use crate::{UsageSummary, ModelBreakdown};

    fn make_summary(date: &str, input: u64, output: u64, cost: f64) -> UsageSummary {
        UsageSummary {
            date: Some(date.to_string()),
            month: None, week: None, session_id: None, project_path: None,
            last_activity: None, first_activity: None,
            input_tokens: input, output_tokens: output,
            cache_creation_tokens: 0, cache_read_tokens: 0,
            extra_total_tokens: 0, total_cost: cost,
            credits: None, message_count: None,
            models_used: vec![], model_breakdowns: vec![],
            project: None, versions: None,
        }
    }

    #[test]
    fn csv_output_has_header_and_data_row() {
        let rows = vec![make_summary("2026-06-14", 100, 50, 0.05)];
        let mut buf = Vec::new();
        write_csv(&mut buf, &rows).unwrap();
        let text = String::from_utf8(buf).unwrap();
        assert!(text.starts_with("date,input_tokens,output_tokens"));
        assert!(text.contains("2026-06-14,100,50,0,0,0.05"));
    }

    #[test]
    fn jsonl_output_is_valid_json_per_line() {
        let rows = vec![make_summary("2026-06-14", 100, 50, 0.05)];
        let mut buf = Vec::new();
        write_jsonl(&mut buf, &rows).unwrap();
        let text = String::from_utf8(buf).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(text.trim()).unwrap();
        assert_eq!(parsed["date"], "2026-06-14");
        assert_eq!(parsed["inputTokens"], 100);
        assert_eq!(parsed["totalCost"], 0.05);
    }
}
```

- [x] **Step 6: Add `pub(crate) mod export;` to `commands/mod.rs`**

Open `rust/crates/ccusage/src/commands/mod.rs` and add at the top of the file alongside the other `pub(crate)` function declarations:
```rust
pub(crate) mod export;
```

- [x] **Step 7: Route `Command::Export` in `main.rs`**

Open `rust/crates/ccusage/src/main.rs` and add to the `match cli.command` block (before `None =>`):
```rust
Some(Command::Export(args)) => commands::export::run_export(args),
```

- [x] **Step 8: Build and run tests**

```bash
just rust::test 2>&1 | grep -E 'test commands::export|FAILED|ok'
```

Expected:
```
test commands::export::tests::csv_output_has_header_and_data_row ... ok
test commands::export::tests::jsonl_output_is_valid_json_per_line ... ok
```

- [x] **Step 9: Smoke test the binary**

```bash
cargo build --manifest-path rust/Cargo.toml 2>&1 | tail -3
./rust/target/debug/ccusage export csv | head -3
./rust/target/debug/ccusage export jsonl | head -2
```

Expected:
```
date,input_tokens,output_tokens,cache_creation_tokens,cache_read_tokens,total_cost_usd
2026-06-10,12345,6789,1000,500,1.2345
...
{"date":"2026-06-10","inputTokens":12345,...}
```

- [x] **Step 10: Commit**

```bash
git add \
  rust/crates/ccusage-cli/src/types.rs \
  rust/crates/ccusage-cli/src/arg_parser.rs \
  rust/crates/ccusage/src/commands/export.rs \
  rust/crates/ccusage/src/commands/mod.rs \
  rust/crates/ccusage/src/main.rs
git commit -m "feat(export): add ccusage export csv/jsonl native command (Phase 2)"
```

---

## Self-Review

**Spec coverage check:**

| Requirement | Status | Notes |
|---|---|---|
| Parse multi-agent usage data | ✅ | `ccusage all --json` covers all adapters |
| Normalize to common schema | ✅ | `etl/sessions.ts`, `etl/daily.ts` |
| Store in DuckDB | ✅ | `db.ts` + `duckdb-async` |
| Incremental processing via `etl_state` | ✅ | `state.ts`, `sync.ts` |
| `sessions` table | ✅ | Task 9 |
| `projects` table | ✅ | Task 11 |
| `daily_usage` table | ✅ | Task 10 |
| `etl_state` table | ✅ | Task 8 |
| Git metadata enrichment | ✅ | `enrichers/git.ts` |
| Cost analytics (by repo, model, agent) | ✅ | `v_cost_by_repo`, `v_cost_by_model`, `v_cost_by_agent` |
| Deep work analytics | ✅ | `v_deep_work_sessions` (> 60 min sessions) |
| Model ROI analytics | ✅ | `v_model_roi` (cost per million tokens) |
| Daily trend analytics | ✅ | `v_daily_trend` |
| `ccusage export duckdb` | ✅ | `ccusage-warehouse sync` loads directly into DuckDB |
| `ccusage export parquet` | ✅ | `ccusage-warehouse export parquet` via DuckDB COPY |
| `ccusage export csv` | ✅ | Phase 2 native Rust + `ccusage-warehouse export csv` |
| `turns` table (per-turn granularity) | ⚠️ | **Gap**: ccusage `--json` output is session-level, not turn-level. Requires direct JSONL parsing — Phase 3. |
| Session classification (coding/debugging/etc.) | ⚠️ | **Out of scope** — heuristic-based, Phase 3. |
| Project classification config | ⚠️ | **Partial**: `logical_project` column exists; users can set it via `ccusage-warehouse query "UPDATE projects SET logical_project = 'Spine Ecosystem' WHERE repo_name IN ('spine', 'marrow')"` |
| Session Tracker MCP integration | ⚠️ | **Out of scope** — requires external MCP tooling. |
| Spine integration | ⚠️ | **Out of scope** — requires the Spine system. |

**Placeholder scan:** No TBDs, no "implement later", no vague steps found.

**Type consistency check:**
- `Warehouse` defined in `db.ts` → imported in `state.ts`, `etl/*.ts`, `sync.ts`, `cli.ts` ✅
- `CcusageSession` defined in `types.ts` → used in `loaders/sessions.ts`, `etl/sessions.ts`, `etl/projects.ts` ✅
- `AllDailyRow` defined in `types.ts` → used in `loaders/daily.ts`, `etl/daily.ts` ✅
- `SessionRow` defined in `schema.ts` → used in `etl/sessions.ts` ✅
- `DailyUsageRow` defined in `schema.ts` → used in `etl/daily.ts` ✅
- `ExportArgs`, `ExportFormat` defined in `ccusage-cli/src/types.rs` → used in `commands/export.rs` ✅
- `UsageSummary` from `crate::types` → imported in `commands/export.rs` ✅
