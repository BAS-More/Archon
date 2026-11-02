/**
 * T1.2 — ARCHON IS THE SINGLE ISOLATION AUTHORITY FOR LOOP.
 *
 * PLAN M1 / R-04: "Archon owns the DAG and isolation; Loop is a node". Loop used to provision its
 * own maker/checker worktrees with its own `git worktree add`. This file proves the replacement
 * end to end: Loop's real `runLoop` is driven through the Archon adapter
 * (aisf-loop-worktree-port.ts) on top of a REAL `WorktreeProvider`, against a real temporary git
 * repository with a real (local, bare) origin. Nothing about the provider is mocked; only the
 * agents are fakes, because the property under test is where they are made to run.
 *
 * FR-15 separation, asserted through the new authority:
 *   1. within one iteration the maker's tree and the checker's tree are different directories;
 *   2. a file the maker leaves uncommitted in its tree does not exist in the checker's tree;
 *   3. N concurrent runs yield 2N distinct trees;
 *   4. every tree an agent ran in is one this WorktreeProvider created (a registered worktree of
 *      the repo, under the provider's own worktree base, recorded by the port);
 *   5. no remote push or remote branch delete was attempted (the origin's pre-receive hook would
 *      record it, and the origin's refs are byte-identical before and after).
 *
 * WHERE LOOP COMES FROM. Loop is a separate repository (BAS-More/Loop). The runner is resolved from
 * AISF_LOOP_ROOT, else the sibling checkout `../Loop` next to this Archon checkout. If it cannot be
 * found the test FAILS — a skipped authority test would be a green run that proved nothing. The one
 * exception is CI (env CI set, AISF_LOOP_ROOT unset), where Archon's own pipeline does not check
 * Loop out; there the suite is skipped with a visible warning.
 */

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { execFileSync } from 'child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { pathToFileURL } from 'url';

import { WorktreeProvider } from '@archon/isolation';

import { createLoopWorktreePort } from './aisf-loop-worktree-port';
import type { LoopWorktreePort } from './aisf-loop-worktree-port';

const ARCHON_ROOT = join(import.meta.dir, '..', '..', '..');

function resolveLoopRunner(): string | null {
  const explicit = process.env.AISF_LOOP_ROOT;
  const roots = explicit ? [explicit] : [join(ARCHON_ROOT, '..', 'Loop')];
  for (const root of roots) {
    const runner = join(root, 'adapters', 'loop-runner.mjs');
    if (existsSync(runner)) return runner;
  }
  return null;
}

const LOOP_RUNNER = resolveLoopRunner();
const SKIP_IN_CI = LOOP_RUNNER === null && !!process.env.CI && !process.env.AISF_LOOP_ROOT;
if (SKIP_IN_CI) {
  console.warn(
    '[aisf-isolation-authority] SKIPPED: Loop is not checked out next to Archon in CI. ' +
      'Set AISF_LOOP_ROOT to run it.'
  );
}

type RunLoop = (input: Record<string, unknown>, deps: Record<string, unknown>) => Promise<any>;

const GIT_ENV: NodeJS.ProcessEnv = {
  ...process.env,
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_TERMINAL_PROMPT: '0',
  GIT_AUTHOR_NAME: 'Fixture',
  GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
  GIT_COMMITTER_NAME: 'Fixture',
  GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
};

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-C', cwd, ...args], { env: GIT_ENV, encoding: 'utf8' });
}

/**
 * Comparable form of a path. The scratch root is resolved with realpathSync.native up front, so
 * every path below it is already long-form (no Windows 8.3 `AVIBEN~1` aliases) and trees that have
 * since been destroyed can still be compared.
 */
function norm(p: string): string {
  const r = resolve(p);
  return process.platform === 'win32' ? r.toLowerCase() : r;
}

const BUDGET = {
  maxIterations: 1,
  maxFilesChanged: 10,
  gateFilesChanged: 10,
  requireVerifier: true,
  denylistPaths: [],
};

describe.skipIf(SKIP_IN_CI)('T1.2 Loop runLoop isolated by Archon WorktreeProvider', () => {
  let scratch: string;
  let origin: string;
  let repo: string;
  let archonHome: string;
  let pushMarker: string;
  let originRefsBefore: string;
  let runLoop: RunLoop;
  const previousArchonHome = process.env.ARCHON_HOME;

  beforeAll(async () => {
    if (LOOP_RUNNER === null) {
      throw new Error(
        'Loop runner not found: set AISF_LOOP_ROOT to a BAS-More/Loop checkout, or check Loop ' +
          `out at ${join(ARCHON_ROOT, '..', 'Loop')}`
      );
    }
    runLoop = ((await import(pathToFileURL(LOOP_RUNNER).href)) as { runLoop: RunLoop }).runLoop;

    scratch = realpathSync.native(mkdtempSync(join(tmpdir(), 'aisf-t12-')));
    archonHome = join(scratch, 'archon-home');
    mkdirSync(archonHome);
    process.env.ARCHON_HOME = archonHome;

    // A local bare origin, so the provider's fetch works offline — and so any push is observable.
    origin = join(scratch, 'origin.git');
    execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origin], { env: GIT_ENV });
    pushMarker = join(scratch, 'PUSH-ATTEMPTED');
    const hook = join(origin, 'hooks', 'pre-receive');
    writeFileSync(
      hook,
      `#!/bin/sh\ncat > "${pushMarker.replace(/\\/g, '/')}"\necho "pushes are forbidden in this fixture" >&2\nexit 1\n`
    );
    chmodSync(hook, 0o755);

    const seed = join(scratch, 'seed');
    execFileSync('git', ['init', '-q', '-b', 'main', seed], { env: GIT_ENV });
    git(seed, 'config', 'commit.gpgsign', 'false');
    writeFileSync(join(seed, 'README.md'), 'baseline\n');
    git(seed, 'add', 'README.md');
    git(seed, 'commit', '-q', '-m', 'baseline');
    // Seed the bare origin directly (bypassing the hook) so the hook only ever sees the test's pushes.
    execFileSync('git', ['-C', origin, 'fetch', '-q', seed, 'main:main'], { env: GIT_ENV });

    repo = join(scratch, 'repo');
    execFileSync('git', ['clone', '-q', origin, repo], { env: GIT_ENV });
    git(repo, 'config', 'commit.gpgsign', 'false');
    originRefsBefore = git(origin, 'for-each-ref');
  });

  afterAll(() => {
    if (previousArchonHome === undefined) delete process.env.ARCHON_HOME;
    else process.env.ARCHON_HOME = previousArchonHome;
    try {
      rmSync(scratch, { recursive: true, force: true, maxRetries: 3 });
    } catch {
      /* best effort */
    }
  });

  /** One Loop run through one port; records where each role ran and what it could see. */
  async function oneRun(provider: WorktreeProvider, tag: string) {
    const port: LoopWorktreePort = createLoopWorktreePort({
      provider,
      canonicalRepoPath: repo,
    });
    const scratchName = `maker-scratch-${tag}.txt`;
    const seen: Record<string, any> = {};
    const runAgent = async ({ role, cwd }: { role: string; cwd: string }) => {
      expect(typeof cwd).toBe('string');
      const commonDir = git(cwd, 'rev-parse', '--path-format=absolute', '--git-common-dir').trim();
      seen[role] = { cwd, real: norm(realpathSync.native(cwd)), commonDir: norm(commonDir) };
      if (role === 'maker') {
        writeFileSync(join(cwd, scratchName), 'uncommitted maker output\n');
        return { ok: true, stdout: 'diff', changedPaths: [scratchName] };
      }
      seen.checkerSeesMakerScratch = existsSync(join(cwd, scratchName));
      seen.checkerHasReadme = existsSync(join(cwd, 'README.md'));
      return { ok: true, stdout: 'VERIFIED' };
    };
    const result = await runLoop(
      { pattern: `t12${tag}`, repo: 'fixture/repo', budget: BUDGET },
      {
        recall: async () => ({ ok: true, results: [] }),
        record: async () => ({ ok: true }),
        audit: async () => ({ ok: true }),
        approve: async () => ({ approved: true, status: 'approved' }),
        startSession: async () => ({ ok: false }),
        closeSession: async () => ({ ok: true }),
        log: () => {},
        worktree: port,
        runAgent,
      }
    );
    return { result, seen, port, scratchName };
  }

  it('maker and checker get separate provider-created trees; the maker’s uncommitted file is absent from the checker’s', async () => {
    const provider = new WorktreeProvider();
    const { result, seen, port, scratchName } = await oneRun(provider, 'single');

    expect(seen.maker).toBeDefined();
    expect(seen.checker).toBeDefined();
    expect(seen.maker.real).not.toBe(seen.checker.real);
    expect(seen.maker.real).not.toBe(norm(repo));
    expect(seen.checker.real).not.toBe(norm(repo));

    // Both are worktrees OF THIS repo, under the provider's base, recorded by the port.
    const repoGit = norm(join(repo, '.git'));
    expect(seen.maker.commonDir).toBe(repoGit);
    expect(seen.checker.commonDir).toBe(repoGit);
    const base = norm(archonHome);
    expect(seen.maker.real.startsWith(base)).toBe(true);
    expect(seen.checker.real.startsWith(base)).toBe(true);
    expect(port.createdPaths().map(p => resolve(p))).toEqual([
      resolve(seen.maker.cwd),
      resolve(seen.checker.cwd),
    ]);

    expect(seen.checkerHasReadme).toBe(true);
    expect(seen.checkerSeesMakerScratch).toBe(false);
    expect(existsSync(join(repo, scratchName))).toBe(false);

    expect(result.status).toBe('proposed');
    // Teardown went through WorktreeProvider.destroy without force: the clean checker tree is
    // gone, the dirty maker tree is retained and reported.
    expect(existsSync(seen.checker.cwd)).toBe(false);
    expect(existsSync(join(seen.maker.cwd, scratchName))).toBe(true);
    expect(result.cleanupFailed).toBe(true);
    expect(result.retainedWorktrees.map((w: { path: string }) => resolve(w.path))).toEqual([
      resolve(seen.maker.cwd),
    ]);
  }, 120_000);

  it('N concurrent runs yield 2N distinct trees, every one created by the provider', async () => {
    const provider = new WorktreeProvider();
    const N = 3;
    const runs = await Promise.all(Array.from({ length: N }, (_, k) => oneRun(provider, `c${k}`)));

    const paths = runs.flatMap(r => [r.seen.maker?.real, r.seen.checker?.real]);
    expect(paths.filter(Boolean)).toHaveLength(2 * N);
    expect(new Set(paths).size).toBe(2 * N);

    const created = new Set(runs.flatMap(r => r.port.createdPaths().map(p => norm(p))));
    expect(created.size).toBe(2 * N);
    for (const p of paths) expect(created.has(p)).toBe(true);

    for (const r of runs) {
      expect(r.result.status).toBe('proposed');
      expect(r.seen.checkerSeesMakerScratch).toBe(false);
    }
  }, 180_000);

  it('no remote push or remote branch delete was attempted', () => {
    expect(existsSync(pushMarker)).toBe(false);
    expect(git(origin, 'for-each-ref')).toBe(originRefsBefore);
    // And the origin was never asked to drop a branch: it still has exactly its seed ref.
    expect(git(origin, 'for-each-ref', '--format=%(refname)').trim()).toBe('refs/heads/main');
    expect(readFileSync(join(origin, 'HEAD'), 'utf8')).toContain('refs/heads/main');
  });
});
