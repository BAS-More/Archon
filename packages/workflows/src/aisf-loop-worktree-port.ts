/**
 * T1.2 — Loop's worktree port, implemented on Archon's isolation provider.
 *
 * PLAN M1 / R-04: Archon owns isolation; Loop is a node. Loop's runLoop provisions one worktree per
 * role per iteration through an injected port:
 *
 *     create(runId) -> { ok, path, branch, error? }
 *     remove(path)  -> { ok, error? }
 *
 * This module is the only implementation of that port. It provisions through an
 * `@archon/isolation` provider (in production a `WorktreeProvider`), so Loop no longer runs any
 * `git worktree` command of its own.
 *
 * Contract details that are load-bearing:
 * - create never falls back. A throw, or an environment without a path, is `ok:false` and Loop ends
 *   the run `isolation-failed` (`worktree-provision-failed:<role>:<iteration>`).
 * - An ADOPTED environment is refused. The provider adopts a tree that already exists at the
 *   derived path; for Loop that means two roles (or two runs) would share one tree, which is the
 *   exact FR-15 violation isolation exists to prevent.
 * - remove calls `destroy(path, { canonicalRepoPath })` and nothing else: no `force` (a dirty tree
 *   is retained, not wiped), no `branchName`, and never `deleteRemoteBranch` (that runs
 *   `git push origin --delete`, a remote-side delete that needs owner approval).
 * - remove reports a throw, `worktreeRemoved:false` or any warning as `ok:false` with the text, so
 *   Loop reports `cleanupFailed` instead of a silent success.
 * - Provider calls are serialised per canonical repo, across every port in this process. The
 *   provider is not safe for concurrent `git worktree add` on one repository (git's own ref and
 *   worktree locks make the losers fail), so N concurrent Loop runs would otherwise lose runs to
 *   `isolation-failed` at random.
 * - remove only accepts a path this port created (or one the injected `isOwned` vouches for).
 *   destroy() treats a directory that is not a worktree as "already removed" and then deletes it
 *   recursively, so a stray path must never reach it.
 */

import { createHash } from 'crypto';
import { resolve } from 'path';

import { toRepoPath } from '@archon/git';
import type { IIsolationProvider, IsolatedEnvironment } from '@archon/isolation';

export interface LoopWorktreeCreateResult {
  ok: boolean;
  path: string;
  branch: string;
  error?: string;
}

export interface LoopWorktreeRemoveResult {
  ok: boolean;
  error?: string;
}

export interface LoopWorktreePort {
  create(runId: string): Promise<LoopWorktreeCreateResult>;
  remove(path: string): Promise<LoopWorktreeRemoveResult>;
  /** Paths this port instance provisioned, in creation order. */
  createdPaths(): readonly string[];
}

export interface LoopWorktreePortOptions {
  provider: IIsolationProvider;
  /** The primary checkout the worktrees belong to (never itself handed to an agent). */
  canonicalRepoPath: string;
  /** Optional "owner/repo" for the provider's project-scoped worktree base. */
  codebaseName?: string;
  /**
   * Ownership check for paths this instance did not create — used by the cross-process bridge,
   * where create and remove run in different processes. Absent: only created paths are accepted.
   */
  isOwned?: (path: string) => boolean | Promise<boolean>;
}

/** The provider slugifies task identifiers and cuts them at 50 characters. */
const PROVIDER_SLUG_MAX = 50;
const HASH_LEN = 10;

/**
 * Map a Loop run id (`<pattern>-<run>-<nonce>-<role>-<iteration>`) to a task identifier that
 * survives the provider's slugify-and-cut unchanged and stays unique per run id.
 *
 * Without the hash, a long pattern pushes the `-maker-1` / `-checker-1` suffix past the cut, both
 * roles derive one branch, and the second create adopts the first role's tree.
 */
export function loopRunIdToTaskIdentifier(runId: string): string {
  const hash = createHash('sha256').update(runId).digest('hex').slice(0, HASH_LEN);
  const slug = runId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, PROVIDER_SLUG_MAX - HASH_LEN - 1)
    .replace(/-+$/g, '');
  return slug ? `${slug}-${hash}` : hash;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function samePath(a: string, b: string): boolean {
  const ra = resolve(a);
  const rb = resolve(b);
  return process.platform === 'win32' ? ra.toLowerCase() === rb.toLowerCase() : ra === rb;
}

/** Tail of the provider-call chain for each canonical repo (process-wide). */
const repoQueues = new Map<string, Promise<unknown>>();

function repoKey(repoPath: string): string {
  const r = resolve(repoPath);
  return process.platform === 'win32' ? r.toLowerCase() : r;
}

/** Run `fn` after every earlier provider call on the same repo has settled. */
function serialised<T>(repoPath: string, fn: () => Promise<T>): Promise<T> {
  const key = repoKey(repoPath);
  const previous = repoQueues.get(key) ?? Promise.resolve();
  const next = previous.then(fn, fn);
  const tail = next.then(
    () => undefined,
    () => undefined
  );
  repoQueues.set(key, tail);
  void tail.then(() => {
    if (repoQueues.get(key) === tail) repoQueues.delete(key);
  });
  return next;
}

export function createLoopWorktreePort(options: LoopWorktreePortOptions): LoopWorktreePort {
  const { provider, canonicalRepoPath, codebaseName, isOwned } = options;
  const repoPath = toRepoPath(canonicalRepoPath);
  const created: string[] = [];

  return {
    async create(runId: string): Promise<LoopWorktreeCreateResult> {
      const identifier = loopRunIdToTaskIdentifier(runId);
      let env: IsolatedEnvironment;
      try {
        env = await serialised(canonicalRepoPath, () =>
          provider.create({
            workflowType: 'task',
            identifier,
            codebaseId: canonicalRepoPath,
            canonicalRepoPath: repoPath,
            ...(codebaseName ? { codebaseName } : {}),
          })
        );
      } catch (error) {
        return { ok: false, path: '', branch: '', error: errorText(error) };
      }
      const path = typeof env?.workingPath === 'string' ? env.workingPath : '';
      const branch = typeof env?.branchName === 'string' ? env.branchName : '';
      if (!path.trim()) {
        return {
          ok: false,
          path: '',
          branch,
          error: 'provider returned an environment with no path',
        };
      }
      if (env.metadata.adopted) {
        return {
          ok: false,
          path: '',
          branch,
          error: `provider adopted an existing worktree at ${path}; a run needs a fresh tree`,
        };
      }
      if (samePath(path, canonicalRepoPath)) {
        return { ok: false, path: '', branch, error: 'provider returned the checkout root' };
      }
      created.push(path);
      return { ok: true, path, branch };
    },

    async remove(path: string): Promise<LoopWorktreeRemoveResult> {
      const target = path;
      const mine = created.some(p => samePath(p, target));
      const vouched = !mine && isOwned ? await isOwned(target) : false;
      if (!target.trim() || samePath(target, canonicalRepoPath) || (!mine && !vouched)) {
        return { ok: false, error: `refused: ${target} was not created by this port` };
      }
      try {
        const result = await serialised(canonicalRepoPath, () =>
          provider.destroy(target, { canonicalRepoPath: repoPath })
        );
        const warnings = result.warnings;
        if (!result.worktreeRemoved) {
          return {
            ok: false,
            error: ['worktreeRemoved:false', ...warnings].join('; '),
          };
        }
        if (warnings.length > 0) return { ok: false, error: warnings.join('; ') };
        return { ok: true };
      } catch (error) {
        return { ok: false, error: errorText(error) };
      }
    },

    createdPaths(): readonly string[] {
      return [...created];
    },
  };
}
