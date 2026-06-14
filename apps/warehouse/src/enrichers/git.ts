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
