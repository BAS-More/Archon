/**
 * Real-subprocess tests for the exec wrapper.
 *
 * This module had NO test file. Every other suite in the repo mocks `execFileAsync`, so its
 * actual behaviour — the thing every bash node, script node and git call depends on — was never
 * exercised. Mocking it everywhere and testing it nowhere is how `bun -e` silently swallowed
 * multi-line script failures for an unknown length of time.
 *
 * Detroit school on purpose: real child processes, no mocks. The whole subject here is what a
 * real OS process does with stdin, stdout, stderr and exit codes. A mock of `spawn` would assert
 * that our code calls the mock the way we expect it to, which is precisely the class of test
 * this project treats as worthless.
 *
 * `bun` is used as the child because it is guaranteed present — it runs this suite.
 */
import { describe, test, expect } from 'bun:test';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { execFileAsync } from './exec';

/** Run a script through `bun run -`, i.e. via stdin. */
function runViaStdin(script: string, options?: { cwd?: string; timeout?: number }) {
  return execFileAsync('bun', ['--no-env-file', 'run', '-'], { ...options, input: script });
}

describe('execFileAsync — input option (stdin)', () => {
  test('captures stdout from a MULTI-LINE script', async () => {
    // The case that `bun -e` gets wrong: with a newline in the argument it resolves with empty
    // stdout and empty stderr no matter what the script did.
    const { stdout } = await runViaStdin(
      'const parts = ["multi", "line"];\nconsole.log(parts.join("-"));'
    );
    expect(stdout.trim()).toBe('multi-line');
  });

  test('rejects when the script has a syntax error, and surfaces the diagnostic', async () => {
    let err: (Error & { code?: number | string; stderr?: string }) | undefined;
    try {
      await runViaStdin('const a = 1;\nthis is not valid javascript');
    } catch (e) {
      err = e as Error & { code?: number | string; stderr?: string };
    }
    expect(err).toBeDefined();
    expect(err!.code).toBe(1);
    // The real parse error must survive — an empty diagnostic is the failure mode being guarded.
    expect(err!.stderr ?? '').toContain('error:');
  });

  test('propagates a specific non-zero exit code', async () => {
    let err: (Error & { code?: number | string }) | undefined;
    try {
      await runViaStdin('console.log("before");\nprocess.exit(7);');
    } catch (e) {
      err = e as Error & { code?: number | string };
    }
    expect(err).toBeDefined();
    // 7, not merely "truthy" — a wrapper that collapsed every failure to 1 would pass a
    // toBeTruthy assertion while losing the script's actual verdict.
    expect(err!.code).toBe(7);
  });

  test('captures stdout produced before a failure', async () => {
    let err: (Error & { stdout?: string }) | undefined;
    try {
      await runViaStdin('console.log("partial output");\nprocess.exit(3);');
    } catch (e) {
      err = e as Error & { stdout?: string };
    }
    expect(err?.stdout ?? '').toContain('partial output');
  });

  test('resolves relative imports against cwd, not against a temp file location', async () => {
    // The regression that ruled out writing inline scripts to a temp dir: `bun -e` resolves
    // `./lib/x` from the process cwd, but a script FILE resolves it from the file's own
    // directory. Piping via stdin keeps the cwd-relative behaviour callers already had.
    const dir = await mkdtemp(join(tmpdir(), 'exec-cwd-'));
    try {
      await writeFile(join(dir, 'helper.ts'), 'export const VALUE = "resolved-from-cwd";', 'utf8');
      const { stdout } = await runViaStdin(
        'import { VALUE } from "./helper.ts";\nconsole.log(VALUE);',
        { cwd: dir }
      );
      expect(stdout.trim()).toBe('resolved-from-cwd');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('the script body never appears in the error message', async () => {
    // With stdin the body is not in argv at all, so Node's "Command failed: <cmd>" line cannot
    // embed it. This is a property of the mechanism, asserted so a future move back to an
    // argument-passing form is caught here rather than by a secret appearing in a log.
    const secret = 'SUPER_SECRET_MARKER_9137';
    let err: Error | undefined;
    try {
      await runViaStdin(`const token = "${secret}";\nthis is not valid javascript`);
    } catch (e) {
      err = e as Error;
    }
    expect(err).toBeDefined();
    expect(err!.message).not.toContain(secret);
  });

  test('honours timeout and reports the process as killed', async () => {
    let err: (Error & { killed?: boolean }) | undefined;
    try {
      await runViaStdin('await new Promise(r => setTimeout(r, 10000));', { timeout: 500 });
    } catch (e) {
      err = e as Error & { killed?: boolean };
    }
    expect(err).toBeDefined();
    expect(err!.killed).toBe(true);
  });

  test('a script that reads nothing from stdin still succeeds', async () => {
    // Guards against the writer deadlocking or EPIPE-ing when the child never drains stdin.
    const { stdout } = await execFileAsync('bun', ['--no-env-file', 'run', '-'], {
      input: 'console.log("done");',
    });
    expect(stdout.trim()).toBe('done');
  });
});

describe('execFileAsync — no input option (unchanged path)', () => {
  test('still resolves stdout for a normal argv invocation', async () => {
    const { stdout } = await execFileAsync('bun', ['--version']);
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  test('still rejects on a non-zero exit', async () => {
    let err: (Error & { code?: number | string }) | undefined;
    try {
      await execFileAsync('bun', ['--no-env-file', '-e', 'process.exit(4)']);
    } catch (e) {
      err = e as Error & { code?: number | string };
    }
    expect(err).toBeDefined();
    expect(err!.code).toBe(4);
  });
});
