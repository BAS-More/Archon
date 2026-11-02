/**
 * T1.2 — process bridge from Loop's standalone node CLI to Archon's WorktreeProvider.
 *
 *   bun aisf-loop-worktree-bridge.ts create <canonicalRepoPath> <runId>
 *   bun aisf-loop-worktree-bridge.ts remove <canonicalRepoPath> <worktreePath>
 *
 * One port call per process. The result is ONE stdout line, `AISF_LOOP_PORT_RESULT <json>`, with
 * Loop's port shape (`{ok,path,branch,error?}` / `{ok,error?}`); the exit code is 0 only when
 * `ok` is true. The prefix matters because the provider's logger also writes to stdout.
 *
 * Create and remove run in different processes, so `remove` cannot use the in-memory record of
 * created paths. It accepts a path only if the provider lists it as a worktree of the repo on an
 * `archon/task-*` branch — the branches this bridge creates — and never the checkout root.
 */

import { resolve } from 'path';

import { WorktreeProvider } from '@archon/isolation';
import type { IIsolationProvider } from '@archon/isolation';

import { createLoopWorktreePort } from './aisf-loop-worktree-port';

export const BRIDGE_RESULT_PREFIX = 'AISF_LOOP_PORT_RESULT ';

function samePath(a: string, b: string): boolean {
  const ra = resolve(a);
  const rb = resolve(b);
  return process.platform === 'win32' ? ra.toLowerCase() === rb.toLowerCase() : ra === rb;
}

export async function runBridge(
  argv: readonly string[],
  provider: IIsolationProvider = new WorktreeProvider()
): Promise<{ ok: boolean; [key: string]: unknown }> {
  const [command, canonicalRepoPath, arg] = argv;
  if (!canonicalRepoPath || !arg) {
    return { ok: false, error: 'usage: create <repo> <runId> | remove <repo> <worktreePath>' };
  }
  const port = createLoopWorktreePort({
    provider,
    canonicalRepoPath,
    isOwned: async path => {
      const envs = await provider.list(canonicalRepoPath);
      return envs.some(
        e => samePath(e.workingPath, path) && e.branchName.startsWith('archon/task-')
      );
    },
  });
  if (command === 'create') return { ...(await port.create(arg)) };
  if (command === 'remove') return { ...(await port.remove(arg)) };
  return { ok: false, error: `unknown command: ${command}` };
}

if (import.meta.main) {
  let out: { ok: boolean; [key: string]: unknown };
  try {
    out = await runBridge(process.argv.slice(2));
  } catch (error) {
    out = { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  process.stdout.write(`${BRIDGE_RESULT_PREFIX}${JSON.stringify(out)}\n`);
  process.exit(out.ok ? 0 : 1);
}
