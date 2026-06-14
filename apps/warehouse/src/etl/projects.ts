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
