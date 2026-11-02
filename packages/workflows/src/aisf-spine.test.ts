/**
 * T1.1 — THE PLATFORM SPINE DAG.
 *
 * AI Software Factory orchestrates its work-package pipeline through Archon's DAG executor.
 * This file is the contract for that pipeline's SHAPE:
 *
 *     intake -> package -> codegen -> sandbox -> test -> evidence -> verdict
 *
 * WHY THESE TESTS EXIST AT ALL. A workflow YAML is a data file. Nothing in a normal build
 * type-checks it, and a typo in `depends_on` does not fail a compile — it produces a DAG that
 * either throws at runtime or, worse, runs a different graph than the one the file appears to
 * describe. In an estate whose entire M0 defect class was "the harness reported success without
 * running", an unvalidated pipeline definition is the same failure one level up: a green run of
 * a graph nobody checked.
 *
 * THE SAFETY PROPERTY. The load-bearing claim of this DAG is not that it has seven nodes. It is
 * that `verdict` cannot be reached without `test` having run. A DAG in which `verdict` depends on
 * `intake` would still parse, still be acyclic, still have seven nodes, and still exit 0 — and it
 * would certify work that was never tested. Node count cannot see that. Reachability can, so
 * reachability is what is asserted.
 *
 * DETROIT-SCHOOL. There are no mocks here. The subject is a real file parsed by Archon's real
 * production entry point (`parseWorkflow`), which runs both Zod validation and `validateDagStructure`.
 * Testing against a hand-rolled copy of the schema would prove only that the copy agrees with
 * itself — the exact mistake that lets a definition drift away from the engine that consumes it.
 */

import { describe, it, expect } from 'bun:test';
import { readFileSync, mkdtempSync, writeFileSync, chmodSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execFileSync } from 'child_process';

import { parseWorkflow } from './loader';
import { buildTopologicalLayers, checkTriggerRule } from './dag-executor';
import type { DagNode } from './schemas';

/** Repo root, from packages/workflows/src. */
const REPO_ROOT = join(import.meta.dir, '..', '..', '..');
const SPINE_PATH = join(REPO_ROOT, '.archon', 'workflows', 'aisf-spine.yaml');

/** The stages, in the order the plan names them. Order is part of the contract. */
const STAGES = ['intake', 'package', 'codegen', 'sandbox', 'test', 'evidence', 'verdict'] as const;

/**
 * Read the spine with line endings normalised to LF.
 *
 * NOT cosmetic. The seeded-defect cases below locate anchors like `- id: intake\n    depends_on: []`
 * by substring. Git rewrote this file to CRLF on a stash round-trip, at which point every one of
 * those anchors stopped matching — and a seed that fails to apply produces a test that passes while
 * asserting nothing. That is the estate's own recurring bug (M0's `sdl_snapshot_matches`, where the
 * whole diff turned out to be \n vs \r\n) reappearing inside the tests meant to catch it.
 *
 * Caught the honest way: the suite went green pre-commit and red immediately after the round-trip.
 * The `not.toEqual(readSpine())` guard on each seed is what surfaced it rather than passing silently.
 */
function readSpine(): string {
  return readFileSync(SPINE_PATH, 'utf8').split('\r\n').join('\n');
}

/** Parse the real file through the real entry point, failing loudly with the parser's own message. */
function parseSpine() {
  const result = parseWorkflow(readSpine(), 'aisf-spine.yaml');
  if (result.error) {
    throw new Error(`spine failed to parse: ${result.error.error}`);
  }
  return result.workflow;
}

/**
 * Every node that must complete before `target` can start, transitively.
 *
 * Written here rather than imported because Archon has no such helper — and the property it
 * proves (a gate cannot be bypassed) is the reason this DAG is shaped the way it is. Its own
 * teeth are asserted below.
 */
function ancestorsOf(nodes: readonly DagNode[], target: string): Set<string> {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const seen = new Set<string>();
  const stack = [...(byId.get(target)?.depends_on ?? [])];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...(byId.get(id)?.depends_on ?? []));
  }
  return seen;
}

describe('the spine parses through Archon production code', () => {
  it('is accepted by parseWorkflow — schema AND dag structure', () => {
    // parseWorkflow runs Zod validation and validateDagStructure (unique ids, depends_on
    // references exist, no cycles, $node.output refs resolve). If this passes, the file is
    // loadable by the real executor, not merely well-formed YAML.
    const result = parseWorkflow(readSpine(), 'aisf-spine.yaml');
    expect(result.error).toBeNull();
    expect(result.workflow).not.toBeNull();
  });

  it('declares exactly the seven planned stages, no more and no fewer', () => {
    const ids = parseSpine()!.nodes.map(n => n.id);
    expect([...ids].sort()).toEqual([...STAGES].sort());
  });
});

describe('topology — the pipeline is a chain, and the chain is in order', () => {
  it('resolves to seven sequential layers of one node each', () => {
    // A stage that accidentally lost its depends_on would land in layer 0 and run CONCURRENTLY
    // with intake — against an empty workspace. That is not a crash; it is a stage doing nothing
    // and reporting success. Layer shape is what catches it.
    const layers = buildTopologicalLayers(parseSpine()!.nodes);
    expect(layers.map(l => l.map(n => n.id))).toEqual(STAGES.map(s => [s]));
  });

  it('each stage depends on exactly its predecessor', () => {
    const byId = new Map(parseSpine()!.nodes.map(n => [n.id, n]));
    expect(byId.get('intake')!.depends_on ?? []).toEqual([]);
    for (let i = 1; i < STAGES.length; i++) {
      expect(byId.get(STAGES[i]!)!.depends_on).toEqual([STAGES[i - 1]!]);
    }
  });
});

describe('THE SAFETY PROPERTY — a verdict cannot be reached without testing', () => {
  it('test is a transitive ancestor of verdict', () => {
    // The whole point of the pipeline. A rewiring that made verdict depend on intake would parse
    // cleanly, be acyclic, and have seven nodes — and would certify untested work.
    expect(ancestorsOf(parseSpine()!.nodes, 'verdict').has('test')).toBe(true);
  });

  it('test is a transitive ancestor of evidence', () => {
    // Evidence captured before the tests ran is evidence of nothing.
    expect(ancestorsOf(parseSpine()!.nodes, 'evidence').has('test')).toBe(true);
  });

  it('the sandbox runs before the tests that judge it', () => {
    expect(ancestorsOf(parseSpine()!.nodes, 'test').has('sandbox')).toBe(true);
  });

  it('every stage is downstream of intake', () => {
    // An orphan stage runs against no work package at all.
    const nodes = parseSpine()!.nodes;
    for (const stage of STAGES.filter(s => s !== 'intake')) {
      expect(ancestorsOf(nodes, stage).has('intake')).toBe(true);
    }
  });
});

describe('TEETH — these assertions fail when the DAG is broken', () => {
  // A suite can parse a file, count its nodes, report seven passing tests, and assert nothing of
  // consequence. Each case below seeds a specific defect into the REAL spine and proves the check
  // above it flags that defect. Without these, the tests are a description, not a gate.

  it('a typo in depends_on is REJECTED by the parser, and named as such', () => {
    // The runtime layer builder reports a dangling reference as "Cycle detected" — a true failure
    // with a misleading cause. The loader catches it first with the correct diagnosis, which is
    // why validation belongs at parse time.
    const broken = readSpine().replace('depends_on: [sandbox]', 'depends_on: [sandbawks]');
    expect(broken).not.toEqual(readSpine()); // the seed actually applied
    const result = parseWorkflow(broken, 'seeded.yaml');
    expect(result.error?.error).toContain('unknown node');
  });

  it('a cycle is REJECTED', () => {
    const broken = readSpine().replace(
      '- id: intake\n    depends_on: []',
      '- id: intake\n    depends_on: [verdict]'
    );
    expect(broken).not.toEqual(readSpine());
    const result = parseWorkflow(broken, 'seeded.yaml');
    expect(result.error?.error).toContain('Cycle detected');
  });

  it('a duplicated stage id is REJECTED', () => {
    const broken = readSpine().replace('- id: evidence', '- id: codegen');
    expect(broken).not.toEqual(readSpine());
    expect(parseWorkflow(broken, 'seeded.yaml').error).not.toBeNull();
  });

  it('the reachability helper reports FALSE when the gate is bypassed', () => {
    // Teeth for the helper itself. If ancestorsOf returned a set containing everything, every
    // safety assertion above would pass vacuously and the suite would be decorative.
    const bypassed: DagNode[] = [
      { id: 'intake' } as DagNode,
      { id: 'test', depends_on: ['intake'] } as DagNode,
      { id: 'verdict', depends_on: ['intake'] } as DagNode, // skips test
    ];
    expect(ancestorsOf(bypassed, 'verdict').has('test')).toBe(false);
    expect(ancestorsOf(bypassed, 'verdict').has('intake')).toBe(true);
  });

  it('the layer assertion notices a stage that lost its dependency', () => {
    // Proves the topology check is not satisfied by "seven nodes in some order".
    const detached = parseSpine()!.nodes.map(n =>
      n.id === 'test' ? ({ ...n, depends_on: [] } as DagNode) : n
    );
    const layers = buildTopologicalLayers(detached);
    expect(layers[0]!.map(n => n.id).sort()).toEqual(['intake', 'test']);
    expect(layers.map(l => l.map(n => n.id))).not.toEqual(STAGES.map(s => [s]));
  });
});

describe('HONESTY — an unimplemented stage must fail, never pass vacuously', () => {
  // Every M0 defect in this estate was a harness reporting success without running. A stub that
  // echoes "TODO" and falls off the end of the script exits 0, and the DAG then reports a
  // complete, successful pipeline run having done nothing. That is the same defect wearing a
  // different hat, so the stub contract is asserted rather than assumed.
  //
  // THIS IS A RATCHET. When T1.9/T1.10/T1.12 wire a stage for real, its entry is removed from
  // STUBBED and this test starts demanding the opposite. Neither direction is silent.
  const STUBBED = ['verdict'] as const; // 'test' T1.9, 'evidence' T1.10, 'package'/'sandbox' T1.12

  const bashOf = (id: string): string => {
    const node = parseSpine()!.nodes.find(n => n.id === id);
    if (!node || !('bash' in node) || typeof node.bash !== 'string') {
      throw new Error(`node '${id}' is not a bash node — update STUBBED if it was implemented`);
    }
    return node.bash;
  };

  /**
   * Executable lines only.
   *
   * The first draft scanned the raw script and failed on a COMMENT reading "can no longer exit 0"
   * — prose about exit 0, not an exit 0. A check that cannot tell those apart would push authors
   * to stop writing the comments that explain the behaviour, to keep the linter quiet.
   */
  const codeOf = (id: string): string =>
    bashOf(id)
      .split('\n')
      .filter(line => !line.trim().startsWith('#'))
      .join('\n');

  for (const id of STUBBED) {
    it(`${id} announces itself unimplemented and exits non-zero`, () => {
      expect(bashOf(id)).toContain('NOT-IMPLEMENTED');
      // `exit 70` (EX_SOFTWARE), never a bare `exit 0` or an implicit fall-through.
      expect(codeOf(id)).toMatch(/\bexit\s+70\b/);
      expect(codeOf(id)).not.toMatch(/\bexit\s+0\b/);
    });
  }

  it('the check REJECTS a stub that would exit 0', () => {
    // Teeth. Without this, the loop above would pass on a script containing the word
    // NOT-IMPLEMENTED and nothing else — which is exactly the rubber stamp it exists to prevent.
    const rubberStamp = 'echo "NOT-IMPLEMENTED: verdict"\nexit 0\n';
    expect(rubberStamp).toContain('NOT-IMPLEMENTED');
    expect(rubberStamp).not.toMatch(/\bexit\s+70\b/);

    const fallThrough = 'echo "NOT-IMPLEMENTED: verdict"\n'; // no exit at all -> exit 0
    expect(fallThrough).not.toMatch(/\bexit\s+70\b/);
  });

  it('the test stage is no longer a stub', () => {
    // Guards the ratchet from the other side: if someone reverts T1.9 to a stub, STUBBED would
    // no longer describe the file and this says so rather than quietly passing.
    const script = parseSpine()!.nodes.find(n => n.id === 'test') as { bash: string };
    expect(script.bash).not.toContain('NOT-IMPLEMENTED');
  });

  it('the evidence stage is no longer a stub (T1.10)', () => {
    // The other side of the T1.10 ratchet: the NOT-IMPLEMENTED / exit 70 stub is gone.
    const code = codeOf('evidence');
    expect(bashOf('evidence')).not.toContain('NOT-IMPLEMENTED: evidence capture (T1.10)');
    expect(code).not.toMatch(/\bexit\s+70\b/);
  });

  it('the codegen stage is a bash node and no longer a stub (T1.4)', () => {
    // Same ratchet for T1.4. codegen used to be a `prompt:` node, which this block skipped
    // entirely; reverting it to a prompt, or to an `exit 70` stub, must fail here.
    const node = parseSpine()!.nodes.find(n => n.id === 'codegen');
    expect(node).toBeDefined();
    expect('bash' in node! && typeof (node as { bash?: unknown }).bash === 'string').toBe(true);
    expect('prompt' in node! && (node as { prompt?: unknown }).prompt !== undefined).toBe(false);
    expect((node as { bash: string }).bash).not.toContain('NOT-IMPLEMENTED');
  });

  it('no stage is left with an unbounded timeout', () => {
    // A hung stage with no timeout stalls the pipeline indefinitely rather than failing it —
    // indistinguishable from slow work, and it never reaches the verdict that would say so.
    for (const node of parseSpine()!.nodes) {
      if ('bash' in node && typeof node.bash === 'string') {
        expect(typeof (node as { timeout?: number }).timeout).toBe('number');
        expect((node as { timeout: number }).timeout).toBeGreaterThan(0);
      }
    }
  });
});

describe('T1.9 — the test stage runs TestTeam and propagates its verdict', () => {
  /**
   * These EXECUTE the node's bash with a fake runner rather than pattern-matching its text.
   *
   * The failure being guarded against is a stage that runs the test suite and then exits 0
   * regardless — the pipeline reports success, the suite reported failure, and no assertion over
   * the script's *wording* would notice. Only running it and observing the exit code can.
   *
   * The fake is placed on PATH under the real command name, which is how resolution works in
   * production too, so the test exercises the same lookup the deployed node will.
   */

  const testStageScript = (): string => {
    const node = parseSpine()!.nodes.find(n => n.id === 'test');
    if (!node || !('bash' in node) || typeof node.bash !== 'string') {
      throw new Error("the 'test' node is not a bash node");
    }
    return node.bash;
  };

  /** Run a script under bash with `testteam` on PATH exiting `code`. Returns the observed status. */
  function runWithFakeRunner(script: string, code: number, opts: { install?: boolean } = {}) {
    const dir = mkdtempSync(join(tmpdir(), 'aisf-t19-'));
    if (opts.install !== false) {
      const fake = join(dir, 'testteam');
      writeFileSync(fake, `#!/bin/sh\necho "fake testteam ran"\nexit ${code}\n`, { mode: 0o755 });
      chmodSync(fake, 0o755);
    }
    // POSIX-ify for msys bash: C:\x -> /c/x
    // Written with string ops rather than regex: msys bash needs `/c/Users/...`, and escaping
    // backslashes inside a regex literal is exactly the kind of thing that silently half-works.
    const posixDir =
      dir[1] === ':'
        ? `/${dir[0]!.toLowerCase()}/${dir.slice(3).split('\\').join('/')}`
        : dir.split('\\').join('/');
    try {
      execFileSync('bash', ['-c', script], {
        env: { ...process.env, PATH: `${posixDir}:${process.env.PATH ?? ''}` },
        encoding: 'utf8',
        stdio: 'pipe',
      });
      return { status: 0 };
    } catch (e) {
      return { status: (e as { status?: number }).status ?? -1 };
    }
  }

  it('a failing suite fails the stage — exit 1 is propagated, not swallowed', () => {
    // THE CENTRAL CASE. TestTeam exits 1 for a blocking agent failure.
    expect(runWithFakeRunner(testStageScript(), 1).status).toBe(1);
  });

  it('advisory warnings are propagated as 2, not flattened to 0 or 1', () => {
    // TestTeam's EXIT_CODE.ADVISORY_WARNINGS. This is also the code deriveVerdict returns when
    // the gates are clean but the evidence does not support a pass — zero tests executed, a
    // silent agent. Flattening it to 0 would reinstate DEF-24 one layer up.
    expect(runWithFakeRunner(testStageScript(), 2).status).toBe(2);
  });

  it('a passing suite passes the stage', () => {
    expect(runWithFakeRunner(testStageScript(), 0).status).toBe(0);
  });

  it('a MISSING runner fails the stage rather than skipping it', () => {
    // The M0 lesson stated as a property: an absent test runner must never read as "nothing to
    // report, carry on". With no fake installed, `command -v` finds nothing.
    const status = runWithFakeRunner(testStageScript(), 0, { install: false }).status;
    expect(status).not.toBe(0);
  });

  it('TEETH — this suite detects a stage that swallows the exit code', () => {
    // Without this, every assertion above would also pass against a script ending in `exit 0`,
    // and the suite would certify the exact defect it exists to prevent.
    const swallowing = 'testteam --phase all || true\nexit 0\n';
    expect(runWithFakeRunner(swallowing, 1).status).toBe(0); // the bad script "passes"
    expect(runWithFakeRunner(testStageScript(), 1).status).toBe(1); // the real one does not
  });
});

describe('T1.4 — the codegen stage runs Loop maker/checker and its scope gate fails the node', () => {
  /**
   * These EXECUTE the codegen node's real bash body against a stub Loop CLI, like the T1.9 block.
   *
   * London-school: Loop's CLI is the collaborator. The stub records the environment it was
   * started with (so LOOP_ROOT, LOOP_ALLOWED_PATHS and LOOP_OPEN_PR are observable) and exits
   * the way the real CLI does: non-zero for `blocked-scope` (Loop's cliExitCode, T1.4), zero for
   * a verified in-scope proposal. A stub that is never started leaves no record — that is how
   * "refused BEFORE Loop is invoked" is asserted.
   *
   * Paths are passed with forward slashes: msys bash and Windows node both accept `C:/x/y`.
   */

  const fwd = (p: string): string => p.split('\\').join('/');

  const codegenScript = (): string => {
    const node = parseSpine()!.nodes.find(n => n.id === 'codegen');
    if (!node || !('bash' in node) || typeof node.bash !== 'string') {
      throw new Error("the 'codegen' node is not a bash node");
    }
    return node.bash;
  };

  const STUB_CLI = `import { writeFileSync } from 'node:fs';
const e = process.env;
writeFileSync(e.AISF_STUB_RECORD, JSON.stringify({
  LOOP_ROOT: e.LOOP_ROOT ?? null, LOOP_ALLOWED_PATHS: e.LOOP_ALLOWED_PATHS ?? null,
  LOOP_OPEN_PR: e.LOOP_OPEN_PR ?? null, LOOP_WORKTREE: e.LOOP_WORKTREE ?? null,
}));
const mode = e.AISF_STUB_MODE;
if (mode === 'garbage') { process.stdout.write('not json at all\\n'); process.exit(0); }
console.log('[loop] FR-06 scope: ' + e.LOOP_ALLOWED_PATHS);
const escaped = mode === 'escape';
const result = {
  status: escaped ? 'blocked-scope' : 'proposed',
  verified: !escaped,
  outsideScope: escaped ? ['secrets/leak.txt'] : [],
  worktree: '/wt/fixture-maker-1',
  checkerWorktree: '/wt/fixture-checker-1',
  reasons: escaped ? ['scope-escape'] : [],
};
process.stdout.write(JSON.stringify(result, null, 2) + '\\n');
process.exitCode = escaped ? 1 : 0;
`;

  type Opts = {
    mode?: 'ok' | 'escape' | 'garbage';
    scope?: unknown;
    cli?: 'stub' | 'unset' | 'missing';
    omitLoopFile?: string;
    env?: Record<string, string>;
    script?: string;
  };

  function runCodegen(opts: Opts = {}) {
    const base = mkdtempSync(join(tmpdir(), 'aisf-t14-'));
    const target = join(base, 'target');
    const artifacts = join(base, 'artifacts');
    const elsewhere = join(base, 'elsewhere'); // cwd, deliberately NOT the target
    const cliDir = join(base, 'loop', 'adapters');
    for (const d of [join(target, '.loop', 'prompts'), artifacts, elsewhere, cliDir]) {
      mkdirSync(d, { recursive: true });
    }
    const loopFiles: Record<string, string> = {
      '.loop/prompts/maker.md': 'maker',
      '.loop/prompts/checker.md': 'checker',
      '.loop/budget.json': '{"maxIterations":1}',
    };
    for (const [rel, body] of Object.entries(loopFiles)) {
      if (rel !== opts.omitLoopFile) writeFileSync(join(target, ...rel.split('/')), body);
    }
    const pkg: Record<string, unknown> = { id: 'wp-1', goal: 'g', acceptance: ['a'] };
    if (opts.scope !== undefined) pkg.scope = opts.scope;
    else pkg.scope = { repos: ['fixture'], paths: ['src/**', 'test/**'] };
    writeFileSync(join(artifacts, 'work-package.json'), JSON.stringify(pkg));
    const cli = join(cliDir, 'loop-runner.cli.mjs');
    if (opts.cli !== 'missing' && opts.cli !== 'unset') writeFileSync(cli, STUB_CLI);
    const record = join(base, 'stub-record.json');

    const env: Record<string, string | undefined> = {
      ...process.env,
      ARTIFACTS_DIR: fwd(artifacts),
      AISF_TARGET_REPO: fwd(target),
      AISF_LOOP_CLI: fwd(cli),
      AISF_STUB_RECORD: fwd(record),
      AISF_STUB_MODE: opts.mode ?? 'ok',
      ...(opts.env ?? {}),
    };
    delete env.LOOP_ROOT;
    delete env.LOOP_ALLOWED_PATHS;
    if (!opts.env || !('LOOP_WORKTREE' in opts.env)) delete env.LOOP_WORKTREE;
    if (opts.cli === 'unset') delete env.AISF_LOOP_CLI;

    let status = 0;
    let stderr = '';
    try {
      execFileSync('bash', ['-c', opts.script ?? codegenScript()], {
        cwd: elsewhere,
        env,
        encoding: 'utf8',
        stdio: 'pipe',
      });
    } catch (e) {
      status = (e as { status?: number }).status ?? -1;
      stderr = String((e as { stderr?: unknown }).stderr ?? '');
    }
    const resultPath = join(artifacts, 'codegen-loop-result.json');
    return {
      status,
      stderr,
      target: fwd(target),
      invoked: existsSync(record),
      record: existsSync(record) ? JSON.parse(readFileSync(record, 'utf8')) : null,
      result: existsSync(resultPath) ? JSON.parse(readFileSync(resultPath, 'utf8')) : null,
    };
  }

  it('a scope escape (blocked-scope) fails the node with the CLI exit code passed through', () => {
    // THE CENTRAL CASE (CAP-16). The stub exits 1 for blocked-scope, as Loop's CLI now does.
    // A non-zero exit is what stops `sandbox` and every later stage from running.
    const r = runCodegen({ mode: 'escape' });
    expect(r.invoked).toBe(true);
    expect(r.status).toBe(1);
  });

  it('an in-scope verified run exits 0 and writes the result artifact', () => {
    const r = runCodegen({ mode: 'ok', env: { LOOP_OPEN_PR: 'on' } });
    expect(r.status).toBe(0);
    expect(r.result).not.toBeNull();
    expect(r.result.status).toBe('proposed');
    expect(r.result.outsideScope).toEqual([]);
    expect(r.result.makerWorktree).toBe('/wt/fixture-maker-1');
    expect(r.result.checkerWorktree).toBe('/wt/fixture-checker-1');
    expect(r.result.makerWorktree).not.toBe(r.result.checkerWorktree);
    // Loop was pointed at the TARGET explicitly (the cwd is elsewhere), given the declared scope,
    // and never allowed to open a PR from inside codegen.
    expect(r.record.LOOP_ROOT).toBe(r.target);
    expect(r.record.LOOP_ALLOWED_PATHS).toBe('src/**,test/**');
    expect(r.record.LOOP_OPEN_PR).not.toBe('on');
  });

  it('a work package with no declared scope fails the node before Loop is invoked', () => {
    for (const scope of [{ repos: ['x'] }, { paths: [] }, { paths: ['', '  '] }, null]) {
      const r = runCodegen({ scope });
      expect(r.status).not.toBe(0);
      expect(r.invoked).toBe(false);
      expect(r.stderr).toMatch(/scope/i);
    }
  });

  it('a missing Loop CLI fails the node and names AISF_LOOP_CLI', () => {
    for (const cli of ['unset', 'missing'] as const) {
      const r = runCodegen({ cli });
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain('AISF_LOOP_CLI');
    }
  });

  it('LOOP_WORKTREE=off is refused before Loop is invoked', () => {
    const r = runCodegen({ env: { LOOP_WORKTREE: 'off' } });
    expect(r.status).not.toBe(0);
    expect(r.invoked).toBe(false);
    expect(r.stderr).toContain('LOOP_WORKTREE=off');
  });

  it('a target without its .loop config fails the node and names the missing file', () => {
    for (const f of ['.loop/prompts/maker.md', '.loop/prompts/checker.md', '.loop/budget.json']) {
      const r = runCodegen({ omitLoopFile: f });
      expect(r.status).not.toBe(0);
      expect(r.invoked).toBe(false);
      expect(r.stderr).toContain(f);
    }
  });

  it('a Loop run that exits 0 without a readable result is a failure, not a pass', () => {
    const r = runCodegen({ mode: 'garbage' });
    expect(r.invoked).toBe(true);
    expect(r.status).not.toBe(0);
  });

  it('the codegen node declares a finite timeout and names loop-runner.cli.mjs in code', () => {
    const node = parseSpine()!.nodes.find(n => n.id === 'codegen') as { timeout?: number };
    expect(typeof node.timeout).toBe('number');
    expect(node.timeout!).toBeGreaterThan(0);
    expect(Number.isFinite(node.timeout!)).toBe(true);
    const code = codegenScript()
      .split('\n')
      .filter(l => !l.trim().startsWith('#'))
      .join('\n');
    expect(code).toContain('loop-runner.cli.mjs');
    expect(code).not.toMatch(/LOOP_OPEN_PR=on/);
  });

  it('TEETH — this suite detects a codegen body that swallows the scope escape', () => {
    // Without this, the escape case would also pass against a body ending in `|| true; exit 0`.
    const swallowing = 'node "${AISF_LOOP_CLI}" >/dev/null || true\nexit 0\n';
    expect(runCodegen({ mode: 'escape', script: swallowing }).status).toBe(0); // bad body "passes"
    expect(runCodegen({ mode: 'escape' }).status).toBe(1); // the real one does not
  });
});

describe('AR-1 Design A (D-18) — all_done only on evidence and verdict, and a failed sandbox is a FAIL', () => {
  /**
   * D-18 adopted Design A only as a package: `trigger_rule: all_done` on evidence (so a failing
   * run still gets an evidence bundle), the T9-3 amendment (all_done is allowed on evidence and
   * verdict and NOWHERE else), and a verdict that renders FAIL when the sandbox failed. These
   * exercise the real gate function (`checkTriggerRule`) and the real verdict bash body.
   */
  const ALLOWED_ALL_DONE = new Set(['evidence', 'verdict']);

  const allDoneIds = (nodes: readonly DagNode[]): string[] =>
    nodes
      .filter(n => (n as { trigger_rule?: string }).trigger_rule === 'all_done')
      .map(n => n.id)
      .sort();

  const out = (state: 'completed' | 'failed' | 'skipped') =>
    ({ state, output: '', ...(state === 'failed' ? { error: '[exit 1]' } : {}) }) as never;

  it('all_done only on evidence and verdict', () => {
    const nodes = parseSpine()!.nodes;
    const ids = allDoneIds(nodes);
    expect(ids).toContain('evidence'); // Design A: evidence runs whatever test did
    for (const id of ids) expect(ALLOWED_ALL_DONE.has(id)).toBe(true);
    // No other trigger rule is in use either: one line of YAML is enough to open the gate.
    for (const n of nodes) {
      const rule = (n as { trigger_rule?: string }).trigger_rule;
      if (!ALLOWED_ALL_DONE.has(n.id)) expect(rule).toBeUndefined();
    }
  });

  it('TEETH — all_done seeded onto test or sandbox is flagged', () => {
    for (const victim of ['test', 'sandbox', 'codegen']) {
      const seeded = readSpine().replace(
        `- id: ${victim}\n`,
        `- id: ${victim}\n    trigger_rule: all_done\n`
      );
      expect(seeded).not.toEqual(readSpine()); // the seed applied
      const parsed = parseWorkflow(seeded, 'seeded.yaml');
      expect(parsed.error).toBeNull(); // it parses — which is exactly why it must be asserted
      const ids = allDoneIds(parsed.workflow!.nodes);
      expect(ids.every(id => ALLOWED_ALL_DONE.has(id))).toBe(false);
    }
  });

  it('evidence runs when test failed (exit 1 or exit 2 both surface as a failed node)', () => {
    const evidence = parseSpine()!.nodes.find(n => n.id === 'evidence')!;
    expect(checkTriggerRule(evidence, new Map([['test', out('failed')]]))).toBe('run');
    expect(checkTriggerRule(evidence, new Map([['test', out('completed')]]))).toBe('run');
    expect(checkTriggerRule(evidence, new Map([['test', out('skipped')]]))).toBe('run');
  });

  it('the stages that are NOT exempt still skip when their upstream failed', () => {
    const nodes = parseSpine()!.nodes;
    const test = nodes.find(n => n.id === 'test')!;
    expect(checkTriggerRule(test, new Map([['sandbox', out('failed')]]))).toBe('skip');
  });

  /** Run the verdict node's real bash. */
  function runVerdict(testStatus?: string) {
    const artifacts = mkdtempSync(join(tmpdir(), 'aisf-ar1-'));
    if (testStatus !== undefined) writeFileSync(join(artifacts, 'test-status.json'), testStatus);
    const node = parseSpine()!.nodes.find(n => n.id === 'verdict') as { bash: string };
    try {
      const stdout = execFileSync('bash', ['-c', node.bash], {
        env: { ...process.env, ARTIFACTS_DIR: artifacts.split('\\').join('/') },
        encoding: 'utf8',
        stdio: 'pipe',
      });
      return { status: 0, stdout };
    } catch (e) {
      return {
        status: (e as { status?: number }).status ?? -1,
        stdout: String((e as { stdout?: unknown }).stdout ?? ''),
      };
    }
  }

  it('verdict FAIL when sandbox failed', () => {
    // A failed sandbox means test is skipped (default all_success), so no test status exists.
    // evidence still runs (all_done) and fails on empty input; verdict also runs (all_done) and
    // must render FAIL — never PASS, never the stub's "not implemented" as if nothing happened.
    const nodes = parseSpine()!.nodes;
    const byId = new Map(nodes.map(n => [n.id, n]));
    const outputs = new Map([['sandbox', out('failed')]]);
    expect(checkTriggerRule(byId.get('test')!, outputs)).toBe('skip');
    outputs.set('test', out('skipped'));
    expect(checkTriggerRule(byId.get('evidence')!, outputs)).toBe('run');
    outputs.set('evidence', out('failed'));
    // verdict must not be skipped silently: it runs and renders FAIL.
    expect(checkTriggerRule(byId.get('verdict')!, outputs)).toBe('run');

    const r = runVerdict(); // no test-status.json: the test stage never ran
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('VERDICT: FAIL');
    expect(r.stdout).not.toContain('PASS');
  });

  it('verdict with an unreadable test status is FAIL, and a present status still reaches the stub', () => {
    expect(runVerdict('not json').stdout).toContain('VERDICT: FAIL');
    expect(runVerdict('not json').status).toBe(1);
    // Until T1.13 merges the verdict does not judge (PLAN.md:920); it stays the honest stub.
    const r = runVerdict('{"exitCode":0}');
    expect(r.status).toBe(70);
    expect(r.stdout).not.toContain('PASS');
  });

  it('verdict does not read the evidence bundle before T1.13 (PLAN.md:920)', () => {
    const node = parseSpine()!.nodes.find(n => n.id === 'verdict') as { bash: string };
    const code = node.bash
      .split('\n')
      .filter(l => !l.trim().startsWith('#'))
      .join('\n');
    expect(code).not.toContain('evidence-bundle');
    expect(code).not.toContain('AISF_CAS');
  });

  it('the test stage records its numeric exit status for evidence and verdict (Design A)', () => {
    const artifacts = mkdtempSync(join(tmpdir(), 'aisf-ar1-t-'));
    const bin = mkdtempSync(join(tmpdir(), 'aisf-ar1-bin-'));
    writeFileSync(join(bin, 'testteam'), '#!/bin/sh\nexit 2\n', { mode: 0o755 });
    const posix = (p: string) =>
      p[1] === ':' ? `/${p[0]!.toLowerCase()}/${p.slice(3).split('\\').join('/')}` : p;
    const node = parseSpine()!.nodes.find(n => n.id === 'test') as { bash: string };
    let status = 0;
    try {
      execFileSync('bash', ['-c', node.bash], {
        env: {
          ...process.env,
          ARTIFACTS_DIR: artifacts.split('\\').join('/'),
          PATH: `${posix(bin)}:${process.env.PATH ?? ''}`,
        },
        stdio: 'pipe',
      });
    } catch (e) {
      status = (e as { status?: number }).status ?? -1;
    }
    expect(status).toBe(2);
    const recorded = JSON.parse(readFileSync(join(artifacts, 'test-status.json'), 'utf8'));
    expect(recorded).toEqual({ exitCode: 2 });
  });
});

describe('T1.10 — the evidence stage builds a CAS bundle and prints its root hash', () => {
  /**
   * London-school. The evidence node has two collaborators, both external processes:
   *   - the bundle builder (Walkthrough-app backend/server/lib/evidence-bundle.js), started as
   *     `node "${AISF_EVIDENCE_LIB}"`, and
   *   - the tinyjuice CAS CLI (`tinyjuice-reduce cat --store-dir DIR TOKEN`), which the node
   *     itself uses to READ BACK and re-hash every object the builder claims to have written.
   * Neither is vendored into this public repo (D-22a / T6.6). Both are replaced here by doubles:
   * a stub builder that records how it was started and writes a content-addressed store, and a
   * fake CAS CLI over that store. The node's own job — input gating, the sandbox-limits field,
   * exit codes, and independent verification of the builder's claim — runs for real.
   */
  const fwd = (p: string): string => p.split('\\').join('/');
  const shortHash = (s: string) =>
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require('crypto') as typeof import('crypto'))
      .createHash('sha256')
      .update(s, 'utf8')
      .digest('hex')
      .slice(0, 32);

  const evidenceScript = (): string => {
    const node = parseSpine()!.nodes.find(n => n.id === 'evidence');
    if (!node || !('bash' in node) || typeof node.bash !== 'string') {
      throw new Error("the 'evidence' node is not a bash node");
    }
    return node.bash;
  };

  // The stub builder. Modes: ok (honest), cas-fail (no write succeeded), tamper (stores an object
  // whose content does not hash to its name), ignore-diff (stores a diff other than the input).
  const STUB_LIB = `const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
const a = process.argv.slice(2); const arg = n => a[a.indexOf(n) + 1];
fs.writeFileSync(process.env.AISF_STUB_RECORD, JSON.stringify({ argv: a,
  testStatus: fs.readFileSync(arg('--test-status'), 'utf8'),
  sandboxLimits: fs.readFileSync(arg('--sandbox-limits'), 'utf8') }));
const mode = process.env.AISF_STUB_MODE || 'ok';
if (mode === 'cas-fail') { console.error('cas: put failed'); process.exit(66); }
const store = arg('--store-dir'); fs.mkdirSync(store, { recursive: true });
const h = s => crypto.createHash('sha256').update(s, 'utf8').digest('hex').slice(0, 32);
const put = (s, lie) => { const k = h(s); fs.writeFileSync(path.join(store, k), lie ?? s); return k; };
const members = {
  diff: put(mode === 'ignore-diff' ? 'other diff\\n' : fs.readFileSync(arg('--diff'), 'utf8')),
  tests: put(fs.readFileSync(arg('--tests'), 'utf8')),
  testExit: put(fs.readFileSync(arg('--test-status'), 'utf8')),
  sandboxLimits: put(fs.readFileSync(arg('--sandbox-limits'), 'utf8'), mode === 'tamper' ? '{"status":"observed"}' : undefined),
};
const root = put(JSON.stringify({ schema: 'aisf-evidence/1', members }));
process.stdout.write('builder log line\\n' + JSON.stringify({ root, members }) + '\\n');
`;

  const FAKE_CAS = `#!/bin/sh
cmd="$1"; shift
[ "$1" = "--store-dir" ] || { echo "requires --store-dir" >&2; exit 2; }
dir="$2"; shift 2
case "$cmd" in
  cat) [ -f "$dir/$1" ] || { echo "token not found: $1" >&2; exit 2; }; cat "$dir/$1" ;;
  *) echo "unknown command: $cmd" >&2; exit 2 ;;
esac
`;

  type Opts = {
    mode?: 'ok' | 'cas-fail' | 'tamper' | 'ignore-diff';
    diff?: string | null;
    tests?: string | null;
    testStatus?: string | null;
    observedLimits?: string;
    configuredLimits?: string;
  };

  function runEvidence(opts: Opts = {}) {
    const base = mkdtempSync(join(tmpdir(), 'aisf-t110-'));
    const artifacts = join(base, 'artifacts');
    const store = join(base, 'cas');
    const elsewhere = join(base, 'cwd'); // not a git repo: no diff can be derived from it
    mkdirSync(artifacts, { recursive: true });
    mkdirSync(elsewhere, { recursive: true });
    const lib = join(base, 'evidence-bundle.js');
    writeFileSync(lib, STUB_LIB);
    const cas = join(base, 'tinyjuice-reduce');
    writeFileSync(cas, FAKE_CAS, { mode: 0o755 });
    chmodSync(cas, 0o755);
    const record = join(base, 'stub-record.json');
    const w = (name: string, v: string | null | undefined, dflt: string) => {
      const body = v === undefined ? dflt : v;
      if (body !== null) writeFileSync(join(artifacts, name), body);
    };
    w('review.diff', opts.diff, 'diff --git a/x b/x\n+changed\n');
    w('executed-tests.json', opts.tests, '["suite > case one","suite > case two"]');
    w('test-status.json', opts.testStatus, '{"exitCode":0}');
    if (opts.observedLimits)
      writeFileSync(join(artifacts, 'sandbox-limits-observed.json'), opts.observedLimits);
    if (opts.configuredLimits)
      writeFileSync(join(artifacts, 'sandbox-limits-configured.json'), opts.configuredLimits);

    const env: Record<string, string | undefined> = {
      ...process.env,
      ARTIFACTS_DIR: fwd(artifacts),
      AISF_EVIDENCE_LIB: fwd(lib),
      AISF_CAS_CLI: fwd(cas),
      AISF_CAS_STORE_DIR: fwd(store),
      AISF_STUB_RECORD: fwd(record),
      AISF_STUB_MODE: opts.mode ?? 'ok',
      AISF_TARGET_REPO: fwd(elsewhere),
    };
    delete env.BASE_BRANCH;
    let status = 0;
    let stdout = '';
    let stderr = '';
    try {
      stdout = execFileSync('bash', ['-c', evidenceScript()], {
        cwd: elsewhere,
        env,
        encoding: 'utf8',
        stdio: 'pipe',
      });
    } catch (e) {
      status = (e as { status?: number }).status ?? -1;
      stdout = String((e as { stdout?: unknown }).stdout ?? '');
      stderr = String((e as { stderr?: unknown }).stderr ?? '');
    }
    const root = /evidence: root ([0-9a-f]{32})/.exec(stdout)?.[1] ?? null;
    const read = (token: string) => readFileSync(join(store, token), 'utf8');
    return {
      status,
      stdout,
      stderr,
      root,
      read,
      invoked: existsSync(record),
      record: existsSync(record) ? JSON.parse(readFileSync(record, 'utf8')) : null,
      bundle: existsSync(join(artifacts, 'evidence-bundle.json'))
        ? JSON.parse(readFileSync(join(artifacts, 'evidence-bundle.json'), 'utf8'))
        : null,
    };
  }

  it('evidence bundle has root hash when test exits 2', () => {
    // THE CENTRAL CASE (AR-1 "Done when"). Insufficient evidence from TestTeam is exit 2; the
    // bundle must still be produced, carry that numeric status, and print its CAS root.
    const r = runEvidence({ testStatus: '{"exitCode":2}' });
    expect(r.status).toBe(0);
    expect(r.root).toMatch(/^[0-9a-f]{32}$/);
    expect(r.record.testStatus).toBe('{"exitCode":2}');
    const manifest = JSON.parse(r.read(r.root!));
    expect(Object.keys(manifest.members).sort()).toEqual([
      'diff',
      'sandboxLimits',
      'testExit',
      'tests',
    ]);
    expect(JSON.parse(r.read(manifest.members.testExit))).toEqual({ exitCode: 2 });
    expect(r.read(manifest.members.diff)).toBe('diff --git a/x b/x\n+changed\n');
    expect(r.bundle.root).toBe(r.root);
    // ...and Design A means evidence actually runs after a failed test node.
    const evidence = parseSpine()!.nodes.find(n => n.id === 'evidence')!;
    expect(
      checkTriggerRule(
        evidence,
        new Map([['test', { state: 'failed', output: '', error: '[exit 2]' } as never]])
      )
    ).toBe('run');
  });

  it('evidence tamper changes root hash', () => {
    // (1) Every object read back hashes to its own name, and the root covers the members.
    const a = runEvidence({ diff: 'diff --git a/x b/x\n+one\n' });
    expect(a.status).toBe(0);
    const manifestText = a.read(a.root!);
    expect(shortHash(manifestText)).toBe(a.root);
    for (const token of Object.values(JSON.parse(manifestText).members) as string[]) {
      expect(shortHash(a.read(token))).toBe(token);
    }
    // (2) Change one byte of one member: the root changes.
    const b = runEvidence({ diff: 'diff --git a/x b/x\n+two\n' });
    expect(b.status).toBe(0);
    expect(b.root).not.toBe(a.root);
    // (3) A stored object whose content does not match its hash is REJECTED by the node's own
    //     read-back — the builder's claim is not trusted — and no root is printed.
    const t = runEvidence({ mode: 'tamper' });
    expect(t.status).toBe(65);
    expect(t.root).toBeNull();
    // (4) A builder that stored some other diff than the one under review is rejected too.
    const d = runEvidence({ mode: 'ignore-diff' });
    expect(d.status).toBe(65);
    expect(d.root).toBeNull();
  });

  it('evidence rejects empty inputs', () => {
    // TP-1.4 / INV-13: no vacuous green. Each empty case exits 66, prints no root, and none of
    // them is reported as success.
    const cases: Array<[string, Opts, boolean]> = [
      ['no diff', { diff: '' }, false],
      ['no diff file and no git repo to derive one', { diff: null }, false],
      ['zero tests executed', { tests: '[]' }, false],
      ['no executed-tests record', { tests: null }, false],
      ['no test exit status', { testStatus: null }, false],
      ['no CAS write succeeded', { mode: 'cas-fail' }, true],
    ];
    for (const [label, opts, builderStarted] of cases) {
      const r = runEvidence(opts);
      expect({ label, status: r.status }).toEqual({ label, status: 66 });
      expect({ label, root: r.root }).toEqual({ label, root: null });
      expect({ label, bundle: r.bundle }).toEqual({ label, bundle: null });
      expect({ label, invoked: r.invoked }).toEqual({ label, invoked: builderStarted });
    }
  });

  it('evidence records unavailable sandbox limits', () => {
    // OC-3 read-back does not exist yet. Configured limits must NOT be passed off as observed.
    const r = runEvidence({
      configuredLimits: '{"pidsLimit":256,"memory":"512m"}',
    });
    expect(r.status).toBe(0);
    const limits = JSON.parse(r.record.sandboxLimits);
    expect(limits.status).toBe('unavailable');
    expect(typeof limits.reason).toBe('string');
    expect(limits.reason.length).toBeGreaterThan(0);
    expect(JSON.stringify(limits)).not.toContain('256');
    expect(JSON.stringify(limits)).not.toContain('512m');
    const manifest = JSON.parse(r.read(r.root!));
    expect(JSON.parse(r.read(manifest.members.sandboxLimits)).status).toBe('unavailable');

    // An "observed" file that does not name a read-back source is not observation either.
    const fake = runEvidence({ observedLimits: '{"limits":{"pidsLimit":256}}' });
    expect(JSON.parse(fake.record.sandboxLimits).status).toBe('unavailable');

    // A genuine read-back is carried through as observed.
    const real = runEvidence({
      observedLimits: '{"source":"docker inspect","limits":{"pidsLimit":256}}',
    });
    const observed = JSON.parse(real.record.sandboxLimits);
    expect(observed.status).toBe('observed');
    expect(observed.limits).toEqual({ pidsLimit: 256 });
  });

  it('a missing collaborator is a configuration failure (64), not an empty-input pass', () => {
    const base = mkdtempSync(join(tmpdir(), 'aisf-t110-cfg-'));
    let status = 0;
    try {
      execFileSync('bash', ['-c', evidenceScript()], {
        env: { ...process.env, ARTIFACTS_DIR: fwd(base), AISF_EVIDENCE_LIB: '', AISF_CAS_CLI: '' },
        stdio: 'pipe',
      });
    } catch (e) {
      status = (e as { status?: number }).status ?? -1;
    }
    expect(status).toBe(64);
  });

  it('the evidence node calls tinyjuice as an external CLI and vendors nothing', () => {
    const code = evidenceScript()
      .split('\n')
      .filter(l => !l.trim().startsWith('#'))
      .join('\n');
    expect(code).toContain('AISF_CAS_CLI');
    expect(code).toContain('AISF_EVIDENCE_LIB');
    expect(existsSync(join(REPO_ROOT, 'vendor', 'tinyjuice'))).toBe(false);
  });
});

describe('T1.12 — the package node validates the work package (fail-closed, no longer a stub)', () => {
  /** Run the package node's real bash against a work package (or none). */
  function runPackage(pkg?: string) {
    const artifacts = mkdtempSync(join(tmpdir(), 'aisf-t112-pkg-'));
    if (pkg !== undefined) writeFileSync(join(artifacts, 'work-package.json'), pkg);
    const node = parseSpine()!.nodes.find(n => n.id === 'package') as { bash: string };
    try {
      execFileSync('bash', ['-c', node.bash], {
        env: { ...process.env, ARTIFACTS_DIR: artifacts.split('\\').join('/') },
        encoding: 'utf8',
        stdio: 'pipe',
      });
      return { status: 0 };
    } catch (e) {
      return { status: (e as { status?: number }).status ?? -1 };
    }
  }
  const valid = {
    id: 'wp-1',
    goal: 'g',
    acceptance: ['a passes'],
    scope: { repos: ['r'], paths: ['src/**'] },
  };

  it('a complete work package passes the gate', () => {
    expect(runPackage(JSON.stringify(valid)).status).toBe(0);
  });

  it('a missing work package is 66, an incomplete or malformed one is 65 — never 0 or 70', () => {
    expect(runPackage().status).toBe(66);
    const bad: unknown[] = [
      'not json',
      '[]',
      { ...valid, id: '' },
      { ...valid, goal: '   ' },
      { ...valid, acceptance: [] },
      { ...valid, acceptance: ['', ' '] },
      { ...valid, scope: {} },
      { ...valid, scope: { repos: [], paths: [] } },
    ];
    for (const b of bad) {
      const r = runPackage(typeof b === 'string' ? b : JSON.stringify(b));
      expect({ b, status: r.status }).toEqual({ b, status: 65 });
    }
  });
});

describe('S-01 — the sandbox node dispatches the agent runtime through the CLI process adapter (T1.12)', () => {
  /**
   * London-school. The collaborator is openhuman's CLI (`openhuman call --method
   * openhuman.inference_agent_chat --params-stdin`), the adapter OQ-4 chose: `agent.run_turn` is an
   * in-process native-bus handler and cannot be reached from Archon (openhuman core/bus.rs:27-30).
   * The fake runtime below records its argv and stdin, so the interaction is asserted, and then
   * answers the way the real CLI does (pretty JSON envelope {result, logs, hit_cap} on stdout).
   * The node's own job — locating the runtime, building the turn, the deadline, judging the
   * outcome, the result artifact and the status file — runs for real.
   */
  const fwd = (p: string): string => p.split('\\').join('/');

  const FAKE_RUNTIME = `#!/bin/sh
printf '%s\\n' "$@" > "$AISF_STUB_RECORD.argv"
cat > "$AISF_STUB_RECORD.stdin"
case "$AISF_STUB_MODE" in
  fail) echo "error: provider unavailable" >&2; exit 1 ;;
  no-outcome) exit 0 ;;
  garbage) echo "not json at all"; exit 0 ;;
  capped) printf '{\\n  "result": "ckpt",\\n  "logs": ["agent chat completed"],\\n  "hit_cap": true,\\n  "checkpoint": "ckpt"\\n}\\n'; exit 0 ;;
  slow) exec sleep 30 ;;
  *) echo "[openhuman] a log line before the envelope"
     printf '{\\n  "result": "implemented the change",\\n  "logs": [\\n    "agent chat completed"\\n  ],\\n  "hit_cap": false\\n}\\n'; exit 0 ;;
esac
`;

  const sandboxScript = (): string => {
    const node = parseSpine()!.nodes.find(n => n.id === 'sandbox');
    if (!node || !('bash' in node) || typeof node.bash !== 'string') {
      throw new Error("the 'sandbox' node is not a bash node");
    }
    return node.bash;
  };

  type Mode = 'ok' | 'fail' | 'no-outcome' | 'garbage' | 'capped' | 'slow';
  type Opts = {
    mode?: Mode;
    cli?: 'fake' | 'missing';
    env?: Record<string, string>;
    script?: string;
  };

  function runSandbox(opts: Opts = {}) {
    const base = mkdtempSync(join(tmpdir(), 'aisf-s01-'));
    const artifacts = join(base, 'artifacts');
    const maker = join(base, 'maker-worktree');
    for (const d of [artifacts, maker]) mkdirSync(d, { recursive: true });
    writeFileSync(
      join(artifacts, 'work-package.json'),
      JSON.stringify({
        id: 'wp-s01',
        goal: 'add a greeting',
        acceptance: ['greet() returns hi'],
        scope: { paths: ['src/**'] },
      })
    );
    writeFileSync(
      join(artifacts, 'codegen-loop-result.json'),
      JSON.stringify({ status: 'proposed', makerWorktree: fwd(maker) })
    );
    const cli = join(base, 'openhuman');
    if (opts.cli !== 'missing') {
      writeFileSync(cli, FAKE_RUNTIME, { mode: 0o755 });
      chmodSync(cli, 0o755);
    }
    const record = join(base, 'record');
    const env: Record<string, string | undefined> = {
      ...process.env,
      ARTIFACTS_DIR: fwd(artifacts),
      AISF_AGENT_CLI: fwd(cli),
      AISF_STUB_RECORD: fwd(record),
      AISF_STUB_MODE: opts.mode ?? 'ok',
      ...(opts.env ?? {}),
    };
    let status = 0;
    let stdout = '';
    let stderr = '';
    try {
      stdout = execFileSync('bash', ['-c', opts.script ?? sandboxScript()], {
        env,
        encoding: 'utf8',
        stdio: 'pipe',
      });
    } catch (e) {
      status = (e as { status?: number }).status ?? -1;
      stdout = String((e as { stdout?: unknown }).stdout ?? '');
      stderr = String((e as { stderr?: unknown }).stderr ?? '');
    }
    const readJson = (p: string) => {
      try {
        return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
      } catch {
        return null; // an empty or partial record is no record
      }
    };
    return {
      status,
      stdout,
      stderr,
      artifacts: fwd(artifacts),
      maker: fwd(maker),
      invoked: existsSync(`${record}.argv`),
      argv: existsSync(`${record}.argv`)
        ? readFileSync(`${record}.argv`, 'utf8').trim().split('\n')
        : null,
      params: readJson(`${record}.stdin`),
      result: readJson(join(artifacts, 'sandbox-result.json')),
      sandboxStatus: readJson(join(artifacts, 'sandbox-status.json')),
    };
  }

  /** What this suite accepts as a successful dispatch: exit 0 AND a success result object. */
  const acceptedAsSuccess = (r: ReturnType<typeof runSandbox>): boolean =>
    r.status === 0 && r.result !== null && r.result.outcome === 'success';

  // The documented failure codes. None may be 0, 70 (NOT-IMPLEMENTED) or 127 (missing binary).
  const RUNTIME_FAILED = 74;
  const RUNTIME_TIMED_OUT = 75;
  const NO_OUTCOME = 76;
  const NOT_SUCCESS = 77;

  it('S-01 success — dispatches one agent turn through the CLI adapter and writes the result object', () => {
    const r = runSandbox({ mode: 'ok' });
    expect(r.status).toBe(0);
    expect(acceptedAsSuccess(r)).toBe(true);
    // The interaction with the collaborator: the existing JSON-RPC method, params on stdin.
    expect(r.argv).toEqual([
      'call',
      '--method',
      'openhuman.inference_agent_chat',
      '--params-stdin',
    ]);
    expect(r.params.cwd).toBe(r.maker); // rooted in the maker worktree codegen produced
    expect(r.params.message).toContain('add a greeting');
    expect(r.params.message).toContain('greet() returns hi');
    expect(r.params.thread_id).toBe('aisf-wp-s01');
    expect(r.result).toMatchObject({
      adapter: 'cli',
      method: 'openhuman.inference_agent_chat',
      outcome: 'success',
      hit_cap: false,
      result: 'implemented the change',
    });
    expect(r.sandboxStatus).toEqual({ exitCode: 0, outcome: 'success' });
  });

  it('S-01 runtime-failure — a failed runtime, a timeout and an absent runtime are distinct non-zero codes', () => {
    const failed = runSandbox({ mode: 'fail' });
    expect(failed.invoked).toBe(true);
    expect(failed.status).toBe(RUNTIME_FAILED);
    expect(failed.sandboxStatus).toEqual({ exitCode: RUNTIME_FAILED, outcome: 'runtime-failed' });

    const slow = runSandbox({ mode: 'slow', env: { AISF_SANDBOX_TIMEOUT_S: '1' } });
    expect(slow.status).toBe(RUNTIME_TIMED_OUT);
    expect(slow.sandboxStatus).toEqual({ exitCode: RUNTIME_TIMED_OUT, outcome: 'timed-out' });

    // Fail closed while the adapter binary is absent: never skipped, never passed.
    const absent = runSandbox({ cli: 'missing' });
    expect(absent.status).toBe(127);
    expect(absent.stderr).toContain('AISF_AGENT_CLI');
    expect(absent.sandboxStatus).toEqual({ exitCode: 127, outcome: 'runtime-absent' });

    const codes = [RUNTIME_FAILED, RUNTIME_TIMED_OUT, NO_OUTCOME, NOT_SUCCESS];
    expect(new Set(codes).size).toBe(codes.length);
    for (const c of codes) expect([0, 70, 127]).not.toContain(c);
    for (const r of [failed, slow, absent]) expect(acceptedAsSuccess(r)).toBe(false);
  }, 20000);

  it('S-01 no-outcome — a runtime that exits 0 without an outcome, or with a non-success one, fails the node', () => {
    for (const mode of ['no-outcome', 'garbage'] as const) {
      const r = runSandbox({ mode });
      expect({ mode, status: r.status }).toEqual({ mode, status: NO_OUTCOME });
      expect({ mode, result: r.result }).toEqual({ mode, result: null });
      expect(r.sandboxStatus).toEqual({ exitCode: NO_OUTCOME, outcome: 'no-outcome' });
    }
    // A turn that stopped at its tool-iteration cap returned an outcome, but not success.
    const capped = runSandbox({ mode: 'capped' });
    expect(capped.status).toBe(NOT_SUCCESS);
    expect(capped.result.outcome).toBe('incomplete');
    expect(acceptedAsSuccess(capped)).toBe(false);
  });

  it('S-01 verdict-fail — a failed sandbox reaches verdict through the status file, and verdict renders FAIL', () => {
    const r = runSandbox({ mode: 'fail' });
    expect(r.status).toBe(RUNTIME_FAILED);

    // Archon's own gate: test is skipped after a failed sandbox; evidence and verdict still run.
    const byId = new Map(parseSpine()!.nodes.map(n => [n.id, n]));
    const failed = { state: 'failed', output: '', error: `[exit ${RUNTIME_FAILED}]` } as never;
    const outputs = new Map<string, never>([['sandbox', failed]]);
    expect(checkTriggerRule(byId.get('test')!, outputs)).toBe('skip');
    outputs.set('test', { state: 'skipped', output: '' } as never);
    expect(checkTriggerRule(byId.get('evidence')!, outputs)).toBe('run');
    outputs.set('evidence', { state: 'failed', output: '', error: '[exit 66]' } as never);
    expect(checkTriggerRule(byId.get('verdict')!, outputs)).toBe('run');

    // The real verdict bash, over the SAME artifacts directory the sandbox wrote.
    const verdict = byId.get('verdict') as unknown as { bash: string };
    let status = 0;
    let stdout = '';
    try {
      stdout = execFileSync('bash', ['-c', verdict.bash], {
        env: { ...process.env, ARTIFACTS_DIR: r.artifacts },
        encoding: 'utf8',
        stdio: 'pipe',
      });
    } catch (e) {
      status = (e as { status?: number }).status ?? -1;
      stdout = String((e as { stdout?: unknown }).stdout ?? '');
    }
    expect(status).toBe(1);
    expect(stdout).toContain('VERDICT: FAIL');
    expect(stdout).toContain(`sandbox failed (exit ${RUNTIME_FAILED}, runtime-failed)`);
    expect(stdout).not.toContain('PASS');
  });

  it('S-01 teeth — a sandbox body that exits 0 without a result object is rejected by this suite', () => {
    // Without this, a body ending in `|| true; exit 0` would also "dispatch".
    const rubberStamp =
      '"${AISF_AGENT_CLI}" call --method openhuman.inference_agent_chat --params-stdin </dev/null >/dev/null 2>&1 || true\nexit 0\n';
    const stamped = runSandbox({ mode: 'fail', script: rubberStamp });
    expect(stamped.status).toBe(0); // the bad body "passes" on exit code alone...
    expect(acceptedAsSuccess(stamped)).toBe(false); // ...and is rejected: no result object
    expect(acceptedAsSuccess(runSandbox({ mode: 'fail' }))).toBe(false); // the real body fails
    expect(acceptedAsSuccess(runSandbox({ mode: 'ok' }))).toBe(true); // and succeeds honestly
    // The exit-70 stub is gone from both the sandbox and the package node.
    const code = (id: string) =>
      (parseSpine()!.nodes.find(n => n.id === id) as unknown as { bash: string }).bash
        .split('\n')
        .filter(l => !l.trim().startsWith('#'))
        .join('\n');
    for (const id of ['sandbox', 'package']) {
      expect(code(id)).not.toMatch(/\bexit\s+70\b/);
      expect(code(id)).not.toContain('NOT-IMPLEMENTED');
    }
  });
});
