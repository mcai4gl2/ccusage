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
      model,
      count(*)                AS session_count,
      sum(estimated_cost_usd) AS total_cost_usd,
      sum(total_tokens)       AS total_tokens
    FROM (
      SELECT unnest(string_split(model_set, ',')) AS model,
             estimated_cost_usd, total_tokens
      FROM sessions WHERE model_set IS NOT NULL
    )
    GROUP BY model
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
      model,
      count(*)                               AS session_count,
      sum(total_tokens)                      AS total_tokens,
      sum(estimated_cost_usd)                AS total_cost_usd,
      round(sum(estimated_cost_usd) / nullif(sum(total_tokens), 0) * 1e6, 4)
                                             AS cost_per_million_tokens
    FROM (
      SELECT unnest(string_split(model_set, ',')) AS model,
             total_tokens, estimated_cost_usd
      FROM sessions WHERE model_set IS NOT NULL
    )
    GROUP BY model
    ORDER BY total_cost_usd DESC`,
};

export async function createViews(db: Warehouse): Promise<void> {
  for (const [name, sql] of Object.entries(VIEWS)) {
    await db.run(sql);
    console.log(`  Created view: ${name}`);
  }
}
