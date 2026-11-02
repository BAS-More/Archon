/**
 * T1.2 — the process bridge that lets Loop's standalone node CLI use Archon's provider.
 *
 * Loop's CLI runs under node (GitHub Actions: loop-propose.yml, loop-pr-babysitter.yml), and
 * `@archon/isolation` is a Bun workspace package of TypeScript sources, so node cannot import it.
 * The bridge is a Bun entry point that runs ONE port call per process and prints one result line.
 * Loop's CLI spawns it with argv (never a shell).
 *
 * Detroit-school: a real `bun` process, a real WorktreeProvider, a real temporary git repo with a
 * local bare origin.
 */

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { execFileSync, spawnSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { BRIDGE_RESULT_PREFIX } from './aisf-loop-worktree-bridge';

const BRIDGE = join(import.meta.dir, 'aisf-loop-worktree-bridge.ts');

const GIT_ENV: NodeJS.ProcessEnv = {
  ...process.env,
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_TERMINAL_PROMPT: '0',
  GIT_AUTHOR_NAME: 'Fixture',
  GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
  GIT_COMMITTER_NAME: 'Fixture',
  GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
};

let scratch: string;
let repo: string;
let archonHome: string;

beforeAll(() => {
  scratch = realpathSync.native(mkdtempSync(join(tmpdir(), 'aisf-t12-bridge-')));
  archonHome = join(scratch, 'archon-home');
  mkdirSync(archonHome);
  const origin = join(scratch, 'origin.git');
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origin], { env: GIT_ENV });
  const seed = join(scratch, 'seed');
  execFileSync('git', ['init', '-q', '-b', 'main', seed], { env: GIT_ENV });
  execFileSync('git', ['-C', seed, 'config', 'commit.gpgsign', 'false'], { env: GIT_ENV });
  writeFileSync(join(seed, 'README.md'), 'baseline\n');
  execFileSync('git', ['-C', seed, 'add', 'README.md'], { env: GIT_ENV });
  execFileSync('git', ['-C', seed, 'commit', '-q', '-m', 'baseline'], { env: GIT_ENV });
  execFileSync('git', ['-C', origin, 'fetch', '-q', seed, 'main:main'], { env: GIT_ENV });
  repo = join(scratch, 'repo');
  execFileSync('git', ['clone', '-q', origin, repo], { env: GIT_ENV });
});

afterAll(() => {
  try {
    rmSync(scratch, { recursive: true, force: true, maxRetries: 3 });
  } catch {
    /* best effort */
  }
});

function bridge(...args: string[]): { code: number | null; result: any; stdout: string } {
  const r = spawnSync(process.execPath, [BRIDGE, ...args], {
    env: { ...GIT_ENV, ARCHON_HOME: archonHome },
    encoding: 'utf8',
    timeout: 60_000,
  });
  const line = (r.stdout || '')
    .split(/\r?\n/)
    .reverse()
    .find(l => l.startsWith(BRIDGE_RESULT_PREFIX));
  return {
    code: r.status,
    result: line ? JSON.parse(line.slice(BRIDGE_RESULT_PREFIX.length)) : null,
    stdout: `${r.stdout}\n${r.stderr}`,
  };
}

describe('aisf-loop-worktree-bridge', () => {
  it('create provisions a provider worktree and remove destroys it, across two processes', () => {
    const made = bridge('create', repo, 'bridge-1-n0-maker-1');
    expect(made.result).not.toBeNull();
    expect(made.result.ok).toBe(true);
    expect(made.code).toBe(0);
    expect(existsSync(join(made.result.path, 'README.md'))).toBe(true);
    expect(made.result.branch).toMatch(/^archon\/task-/);

    const gone = bridge('remove', repo, made.result.path);
    expect(gone.result).toEqual({ ok: true });
    expect(gone.code).toBe(0);
    expect(existsSync(made.result.path)).toBe(false);
  }, 120_000);

  it('remove refuses the checkout root and any path the provider did not create', () => {
    const root = bridge('remove', repo, repo);
    expect(root.result.ok).toBe(false);
    expect(root.code).not.toBe(0);
    expect(existsSync(join(repo, 'README.md'))).toBe(true);

    const stray = join(scratch, 'not-a-worktree');
    mkdirSync(stray);
    writeFileSync(join(stray, 'keep.txt'), 'keep\n');
    const other = bridge('remove', repo, stray);
    expect(other.result.ok).toBe(false);
    expect(existsSync(join(stray, 'keep.txt'))).toBe(true);
  }, 120_000);

  it('a dirty tree is retained and reported, never force-removed', () => {
    const made = bridge('create', repo, 'bridge-1-n0-maker-2');
    expect(made.result.ok).toBe(true);
    writeFileSync(join(made.result.path, 'uncommitted.txt'), 'maker bytes\n');

    const kept = bridge('remove', repo, made.result.path);
    expect(kept.result.ok).toBe(false);
    expect(String(kept.result.error)).toMatch(/modified or untracked|untracked/i);
    expect(existsSync(join(made.result.path, 'uncommitted.txt'))).toBe(true);
  }, 120_000);

  it('rejects unknown commands and missing arguments with a result line, not a stack trace', () => {
    const bad = bridge('explode', repo, 'x');
    expect(bad.result.ok).toBe(false);
    expect(bad.code).not.toBe(0);
    const missing = bridge('create', repo);
    expect(missing.result.ok).toBe(false);
  });
});
