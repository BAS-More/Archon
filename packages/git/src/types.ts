import { isAbsolute } from 'path';

// Branded types for type-level safety of commonly confused string primitives
declare const REPO_PATH_BRAND: unique symbol;
declare const BRANCH_NAME_BRAND: unique symbol;
declare const WORKTREE_PATH_BRAND: unique symbol;

export type RepoPath = string & { readonly [REPO_PATH_BRAND]: true };
export type BranchName = string & { readonly [BRANCH_NAME_BRAND]: true };
export type WorktreePath = string & { readonly [WORKTREE_PATH_BRAND]: true };

/**
 * Validates a path for a branded cast and returns it unchanged.
 *
 * It must not rewrite the value: these are casts, and `resolve()` turned `/workspace/repo` into
 * `D:\workspace\repo` on Windows, which broke worktree and owner/repo parsing there.
 */
function assertAbsolutePath(value: string, label: string): string {
  if (!value.trim()) throw new Error(`${label} cannot be empty`);
  if (value.includes('\0')) throw new Error(`${label} cannot contain NUL bytes`);
  if (!isAbsolute(value)) throw new Error(`${label} must be an absolute path`);
  return value;
}

/** Cast a plain string to RepoPath. Rejects empty or invalid paths. */
export function toRepoPath(path: string): RepoPath {
  return assertAbsolutePath(path, 'RepoPath') as RepoPath;
}

/** Cast a plain string to BranchName. Rejects empty strings. */
export function toBranchName(name: string): BranchName {
  if (!name) throw new Error('BranchName cannot be empty');
  return name as BranchName;
}

/** Cast a plain string to WorktreePath. Rejects empty or invalid paths. */
export function toWorktreePath(path: string): WorktreePath {
  return assertAbsolutePath(path, 'WorktreePath') as WorktreePath;
}

/** Discriminated union for git operation results at package boundaries */
export type GitResult<T> = { ok: true; value: T } | { ok: false; error: GitError };

/** Discriminated union of git error codes used by cloneRepository, syncRepository */
export type GitError =
  | { code: 'not_a_repo'; path: string }
  | { code: 'permission_denied'; path: string }
  | { code: 'branch_not_found'; branch: string }
  | { code: 'no_space'; path: string }
  | { code: 'unknown'; message: string };

/** Result of a workspace sync operation */
export interface WorkspaceSyncResult {
  branch: BranchName;
  synced: boolean;
  /** HEAD SHA before the reset (short, 8 chars) */
  previousHead: string;
  /** HEAD SHA after the reset (short, 8 chars) */
  newHead: string;
  /** True if the working tree was updated (HEAD changed) */
  updated: boolean;
}

/** Info about a single worktree entry */
export interface WorktreeInfo {
  path: WorktreePath;
  branch: BranchName;
}
