/**
 * T1.2 — the Archon-side adapter that gives Loop its worktree port.
 *
 * Loop's runLoop asks for `worktree.create(runId) -> { ok, path, branch, error? }` and
 * `worktree.remove(path) -> { ok, error? }`. Before T1.2 Loop answered both itself with its own
 * `git worktree add/remove`. After T1.2 the only provisioner is `@archon/isolation`'s
 * WorktreeProvider, and this adapter is the seam between the two contracts.
 *
 * LONDON-SCHOOL. The provider is the collaborator, so these tests hand the adapter a recording
 * provider and assert on the CONVERSATION: what create/destroy were called with, and how each
 * provider answer is translated for Loop. The real-provider, real-git proof lives in
 * aisf-isolation-authority.test.ts.
 */

import { describe, it, expect } from 'bun:test';

import type {
  DestroyResult,
  IIsolationProvider,
  IsolatedEnvironment,
  IsolationRequest,
  WorktreeDestroyOptions,
} from '@archon/isolation';

import { createLoopWorktreePort, loopRunIdToTaskIdentifier } from './aisf-loop-worktree-port';

const REPO = '/fixture/repo';

interface Recorder {
  provider: IIsolationProvider;
  creates: IsolationRequest[];
  destroys: { envId: string; options: WorktreeDestroyOptions | undefined }[];
}

function env(path: string, branch: string, adopted = false): IsolatedEnvironment {
  return {
    id: path,
    provider: 'worktree',
    workingPath: path,
    branchName: branch,
    status: 'active',
    createdAt: new Date(0),
    metadata: { adopted },
  } as unknown as IsolatedEnvironment;
}

const CLEAN: DestroyResult = {
  worktreeRemoved: true,
  branchDeleted: null,
  remoteBranchDeleted: null,
  directoryClean: true,
  warnings: [],
};

function recorder(
  opts: {
    create?: (req: IsolationRequest) => Promise<IsolatedEnvironment>;
    destroy?: (envId: string) => Promise<DestroyResult>;
  } = {}
): Recorder {
  const creates: IsolationRequest[] = [];
  const destroys: Recorder['destroys'] = [];
  const provider = {
    providerType: 'worktree',
    create: async (req: IsolationRequest): Promise<IsolatedEnvironment> => {
      creates.push(req);
      if (opts.create) return opts.create(req);
      const id = (req as { identifier: string }).identifier;
      return env(`/wt/${id}`, `archon/task-${id}`);
    },
    destroy: async (envId: string, options?: WorktreeDestroyOptions): Promise<DestroyResult> => {
      destroys.push({ envId, options });
      return opts.destroy ? opts.destroy(envId) : { ...CLEAN, warnings: [] };
    },
    get: async () => null,
    list: async () => [],
    healthCheck: async () => true,
  } as unknown as IIsolationProvider;
  return { provider, creates, destroys };
}

describe('createLoopWorktreePort.create', () => {
  it('asks the provider for a task environment on the canonical repo and returns Loop’s shape', async () => {
    const r = recorder();
    const port = createLoopWorktreePort({ provider: r.provider, canonicalRepoPath: REPO });

    const out = await port.create('sepfs-adhoc-n0-maker-1');

    expect(r.creates).toHaveLength(1);
    const req = r.creates[0] as IsolationRequest & { identifier: string };
    expect(req.workflowType).toBe('task');
    expect(req.canonicalRepoPath).toBe(REPO);
    expect(req.identifier).toBe(loopRunIdToTaskIdentifier('sepfs-adhoc-n0-maker-1'));
    expect(out.ok).toBe(true);
    expect(out.path).toBe(`/wt/${req.identifier}`);
    expect(out.branch).toBe(`archon/task-${req.identifier}`);
    expect(port.createdPaths()).toEqual([out.path]);
  });

  it('reports ok:false with the provider’s message when create throws (never a fallback path)', async () => {
    const r = recorder({
      create: async () => {
        throw new Error('fatal: could not lock config file');
      },
    });
    const port = createLoopWorktreePort({ provider: r.provider, canonicalRepoPath: REPO });

    const out = await port.create('p-1-n0-maker-1');

    expect(out.ok).toBe(false);
    expect(out.path).toBe('');
    expect(out.error).toContain('could not lock config file');
    expect(port.createdPaths()).toEqual([]);
  });

  it('reports ok:false when the provider returns an environment with no path', async () => {
    const r = recorder({ create: async () => env('', 'archon/task-x') });
    const port = createLoopWorktreePort({ provider: r.provider, canonicalRepoPath: REPO });

    const out = await port.create('p-1-n0-checker-1');

    expect(out.ok).toBe(false);
    expect(out.path).toBe('');
    expect(out.error).toMatch(/no path/i);
  });

  it('refuses an ADOPTED environment: a run must never share a tree that already existed', async () => {
    const r = recorder({ create: async () => env('/wt/existing', 'archon/task-existing', true) });
    const port = createLoopWorktreePort({ provider: r.provider, canonicalRepoPath: REPO });

    const out = await port.create('p-1-n0-checker-1');

    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/adopt/i);
    expect(port.createdPaths()).toEqual([]);
    // It was not ours, so it is not torn down either.
    expect(r.destroys).toHaveLength(0);
  });
});

describe('provider calls are serialised per repo', () => {
  it('never lets two ports on one repo call the provider concurrently', async () => {
    // Concurrent `git worktree add` on one repository loses runs to git's own locks (seen against
    // the real provider in aisf-isolation-authority.test.ts), so the adapter queues per repo.
    let inFlight = 0;
    let maxInFlight = 0;
    const slow = async (req: IsolationRequest): Promise<IsolatedEnvironment> => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise(r => setTimeout(r, 5));
      inFlight--;
      const id = (req as { identifier: string }).identifier;
      return env(`/wt/${id}`, `archon/task-${id}`);
    };
    const a = createLoopWorktreePort({
      provider: recorder({ create: slow }).provider,
      canonicalRepoPath: REPO,
    });
    const b = createLoopWorktreePort({
      provider: recorder({ create: slow }).provider,
      canonicalRepoPath: REPO,
    });

    const outs = await Promise.all([
      a.create('r1-maker-1'),
      b.create('r2-maker-1'),
      a.create('r1-checker-1'),
    ]);

    expect(outs.every(o => o.ok)).toBe(true);
    expect(maxInFlight).toBe(1);
  });
});

describe('loopRunIdToTaskIdentifier', () => {
  it('keeps maker and checker distinct even when the provider’s 50-char slug cut would merge them', () => {
    // WorktreeProvider slugifies task identifiers and cuts them at 50 chars, so a long pattern
    // pushes `-maker-1` / `-checker-1` past the cut and two roles would get ONE branch — and the
    // provider would adopt the first tree for the second role.
    const longPattern = 'a-pattern-name-that-is-easily-long-enough-to-hit-the-cut';
    const maker = loopRunIdToTaskIdentifier(`${longPattern}-adhoc-n0-maker-1`);
    const checker = loopRunIdToTaskIdentifier(`${longPattern}-adhoc-n0-checker-1`);

    expect(maker).not.toBe(checker);
    expect(maker.length).toBeLessThanOrEqual(50);
    expect(checker.length).toBeLessThanOrEqual(50);
    expect(maker).toMatch(/^[a-z0-9-]+$/);
  });

  it('is deterministic for one run id', () => {
    expect(loopRunIdToTaskIdentifier('x-1-n0-maker-2')).toBe(
      loopRunIdToTaskIdentifier('x-1-n0-maker-2')
    );
  });
});

describe('createLoopWorktreePort.remove', () => {
  async function portWithOne(destroy?: (envId: string) => Promise<DestroyResult>) {
    const r = recorder({ destroy });
    const port = createLoopWorktreePort({ provider: r.provider, canonicalRepoPath: REPO });
    const made = await port.create('p-1-n0-maker-1');
    return { r, port, path: made.path };
  }

  it('calls destroy with canonicalRepoPath only — never force, never deleteRemoteBranch', async () => {
    const { r, port, path } = await portWithOne();

    const out = await port.remove(path);

    expect(out).toEqual({ ok: true });
    expect(r.destroys).toHaveLength(1);
    expect(r.destroys[0].envId).toBe(path);
    expect(r.destroys[0].options).toEqual({ canonicalRepoPath: REPO });
    expect(r.destroys[0].options).not.toHaveProperty('force');
    expect(r.destroys[0].options).not.toHaveProperty('deleteRemoteBranch');
    expect(r.destroys[0].options).not.toHaveProperty('branchName');
  });

  it('reports a destroy that throws as ok:false with the error text', async () => {
    const { port, path } = await portWithOne(async () => {
      throw new Error(
        "fatal: '/wt/x' contains modified or untracked files, use --force to delete it"
      );
    });

    const out = await port.remove(path);

    expect(out.ok).toBe(false);
    expect(out.error).toContain('contains modified or untracked files');
  });

  it('reports worktreeRemoved:false as ok:false, never as success', async () => {
    const { port, path } = await portWithOne(async () => ({
      ...CLEAN,
      worktreeRemoved: false,
      warnings: [],
    }));

    const out = await port.remove(path);

    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/worktreeRemoved:false/);
  });

  it('reports non-empty warnings as ok:false and carries the warning text', async () => {
    const { port, path } = await portWithOne(async () => ({
      ...CLEAN,
      warnings: ['Failed to clean remaining directory at /wt/x: EBUSY'],
    }));

    const out = await port.remove(path);

    expect(out.ok).toBe(false);
    expect(out.error).toContain('Failed to clean remaining directory at /wt/x: EBUSY');
  });

  it('refuses to destroy a path this port did not create, without calling the provider', async () => {
    // destroy() treats a non-worktree directory as "already removed" and then rm -rf's it; a
    // stray path (the repo root, a user directory) must never reach it.
    const { r, port } = await portWithOne();

    const out = await port.remove(REPO);

    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/not created by this port/i);
    expect(r.destroys).toHaveLength(0);
  });

  it('accepts a path the injected ownership check vouches for (the cross-process bridge)', async () => {
    const r = recorder();
    const port = createLoopWorktreePort({
      provider: r.provider,
      canonicalRepoPath: REPO,
      isOwned: async p => p === '/wt/from-an-earlier-process',
    });

    expect(await port.remove('/wt/from-an-earlier-process')).toEqual({ ok: true });
    expect((await port.remove('/somewhere/else')).ok).toBe(false);
    expect(r.destroys.map(d => d.envId)).toEqual(['/wt/from-an-earlier-process']);
  });
});
