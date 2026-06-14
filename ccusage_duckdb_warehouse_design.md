# AI Usage Warehouse for ccusage

## Goal

Extend ccusage from a reporting tool into a local analytics platform that can:

- Parse usage data from Claude Code, Codex, OpenCode, OpenClaw, Gemini CLI, and future agents.
- Normalize usage information into a common schema.
- Store historical usage in DuckDB.
- Support advanced analytics beyond cost tracking.
- Integrate with Session Tracker MCP.
- Optionally publish metrics into Spine.

---

# Vision

```text
Claude Code
Codex
OpenCode
OpenClaw
Gemini CLI
    |
    v
+------------------+
|     ccusage      |
| Existing Parsers |
+------------------+
    |
    v
+------------------+
| Normalization    |
| Layer            |
+------------------+
    |
    +-------------------+
    |                   |
    v                   v
 DuckDB            Parquet Export
    |
    +-------------------+
    |
    +--> Dashboards
    +--> MCP Integration
    +--> Productivity Analytics
    +--> Cost Analytics
    +--> Session Analytics
```

---

# Why Build This?

Current ccusage focuses primarily on:

- Token consumption
- Cost estimates
- Daily/monthly reports

What developers really want:

- Which projects consume the most AI assistance?
- Which models provide the best ROI?
- How much AI effort is going into each repository?
- Which sessions produce the most commits?
- How much time is spent in deep work?
- How does AI usage correlate with productivity?

DuckDB becomes the analytical backend.

---

# Architecture

## Phase 1 (Recommended)

External ETL.

Keep ccusage unchanged.

```text
ccusage --json
      |
      v
AI Usage ETL
      |
      v
DuckDB
```

Benefits:

- No changes to ccusage internals.
- Faster initial delivery.
- Easier upgrades.

---

## Phase 2

Native integration.

Possible commands:

```bash
ccusage export duckdb
ccusage export parquet
ccusage export spine
```

This reuses parser infrastructure directly.

---

# Data Model

## sessions

```sql
CREATE TABLE sessions (
    session_id TEXT,
    agent TEXT,
    project_path TEXT,
    repo_name TEXT,
    branch TEXT,

    started_at TIMESTAMP,
    ended_at TIMESTAMP,

    duration_sec BIGINT,

    model_set TEXT,

    total_tokens BIGINT,
    input_tokens BIGINT,
    output_tokens BIGINT,

    cache_creation_tokens BIGINT,
    cache_read_tokens BIGINT,

    reasoning_tokens BIGINT,

    estimated_cost_usd DOUBLE
);
```

---

## turns

```sql
CREATE TABLE turns (
    session_id TEXT,

    ts TIMESTAMP,

    agent TEXT,
    model TEXT,

    role TEXT,

    input_tokens BIGINT,
    output_tokens BIGINT,

    cost_usd DOUBLE,

    raw_event_hash TEXT
);
```

---

## projects

```sql
CREATE TABLE projects (
    project_path TEXT,
    repo_name TEXT,
    logical_project TEXT,

    first_seen TIMESTAMP,
    last_seen TIMESTAMP
);
```

---

## daily_usage

```sql
CREATE TABLE daily_usage (
    date DATE,

    agent TEXT,
    project_path TEXT,

    session_count BIGINT,

    total_tokens BIGINT,
    total_cost_usd DOUBLE
);
```

---

# Metadata Enrichment

The warehouse should enrich raw usage records.

## Git Metadata

Capture:

- repository name
- branch
- commit SHA
- working directory

Example:

```text
C:/dev/spine
  -> repo: spine
  -> branch: feature/orderbook
```

---

## Project Classification

Map repositories into logical projects.

Example:

```text
Repo
  spine
  marrow
  pluse

Logical Project
  Spine Ecosystem
```

---

## Session Classification

Automatically infer:

- coding
- debugging
- research
- documentation
- infrastructure
- testing

Possible approach:

- commit messages
- filenames
- prompt metadata
- session summaries

---

# Analytics

## Cost Analytics

Questions:

- Cost by day
- Cost by repo
- Cost by model
- Cost by agent

Example:

```sql
select
  repo_name,
  sum(estimated_cost_usd)
from sessions
group by repo_name;
```

---

## Productivity Analytics

Questions:

- Tokens per commit
- Cost per commit
- Sessions per commit
- Cost per repository

---

## Deep Work Analytics

Identify:

- sessions > 60 minutes
- uninterrupted coding windows
- peak productivity periods

---

## Model ROI

Questions:

- Which model consumes most tokens?
- Which model is used longest?
- Which model produces most commits?

---

# Session Tracker MCP Integration

Potential architecture:

```text
Session Tracker MCP
       |
       v
Session Metadata

ccusage
       |
       v
Token Metadata

DuckDB
       |
       v
Unified View
```

Example:

```sql
select
  s.repo_name,
  s.total_tokens,
  m.summary
from sessions s
join mcp_sessions m
on s.session_id = m.session_id;
```

---

# Spine Integration

Optional.

Publish usage metrics into Spine.

Tables:

```text
ai_sessions
ai_daily_usage
ai_costs
ai_models
```

Benefits:

- Marrow visualization
- Real-time dashboards
- Alerting

---

# Incremental Processing

Do not re-import everything every run.

Maintain:

```sql
etl_state(
    source,
    last_processed_timestamp,
    last_processed_session
)
```

Process only new data.

---

# Export Targets

## DuckDB

Primary backend.

## Parquet

For archival and analytics.

## CSV

For interoperability.

## Spine

For real-time monitoring.

---

# Example Queries

Most expensive repositories:

```sql
select
  repo_name,
  sum(estimated_cost_usd) cost
from sessions
group by repo_name
order by cost desc;
```

Deep-work sessions:

```sql
select *
from sessions
where duration_sec > 3600;
```

Daily trend:

```sql
select
  date(started_at),
  sum(total_tokens)
from sessions
group by 1;
```

---

# Future Enhancements

## GitHub Correlation

Join:

- commits
- pull requests
- AI sessions

Questions:

- AI cost per PR
- AI cost per feature
- Tokens per LOC changed

---

## Local Dashboard

Possible stack:

- DuckDB
- Python
- FastAPI
- Apache Superset
- Grafana

---

## AI Productivity Observatory

Long-term vision:

Treat AI coding activity like observability data.

Track:

- effort
- cost
- productivity
- session behavior
- project focus

across all AI coding tools from a single warehouse.
