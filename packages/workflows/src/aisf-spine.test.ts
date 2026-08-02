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
import { readFileSync } from 'fs';
import { join } from 'path';

import { parseWorkflow } from './loader';
import { buildTopologicalLayers } from './dag-executor';
import type { DagNode } from './schemas';

/** Repo root, from packages/workflows/src. */
const REPO_ROOT = join(import.meta.dir, '..', '..', '..');
const SPINE_PATH = join(REPO_ROOT, '.archon', 'workflows', 'aisf-spine.yaml');

/** The stages, in the order the plan names them. Order is part of the contract. */
const STAGES = ['intake', 'package', 'codegen', 'sandbox', 'test', 'evidence', 'verdict'] as const;

function readSpine(): string {
  return readFileSync(SPINE_PATH, 'utf8');
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
  const STUBBED = ['package', 'sandbox', 'test', 'evidence', 'verdict'] as const;

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
