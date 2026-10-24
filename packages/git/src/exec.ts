import { execFile, spawn } from 'child_process';
import { mkdir as fsMkdir } from 'fs/promises';
import { promisify } from 'util';

const promisifiedExecFile = promisify(execFile);

export interface ExecFileOptions {
  timeout?: number;
  cwd?: string;
  maxBuffer?: number;
  env?: NodeJS.ProcessEnv;
  /**
   * Text piped to the child's stdin. When set, the child is spawned rather than exec'd so the
   * payload never touches argv.
   *
   * This exists because `bun -e <script>` on Windows resolves with empty stdout AND empty stderr
   * whenever the script contains a newline — a failing script reports success and a succeeding
   * one produces no output. Writing the script to a temp file fixes that but breaks relative
   * imports, since a file resolves `./x` from its own directory while `-e` resolves it from cwd.
   * Piping via stdin (`bun run -`) is the only form that keeps cwd-relative resolution, reports
   * failures honestly, and writes nothing to disk.
   *
   * It also removes a leak by construction: with the body out of argv, Node's
   * `Command failed: <cmd>` line cannot embed the script (and any secret in it).
   */
  input?: string;
}

/** Error shape callers rely on — mirrors Node's ExecFileException. */
interface SubprocessError extends Error {
  code?: number | string;
  killed?: boolean;
  stdout?: string;
  stderr?: string;
  cmd?: string;
}

/** Wrapper around child_process.execFile for test mockability */
export async function execFileAsync(
  cmd: string,
  args: string[],
  options?: ExecFileOptions
): Promise<{ stdout: string; stderr: string }> {
  if (options?.input !== undefined) {
    return execFileWithStdin(cmd, args, options, options.input);
  }
  const result = await promisifiedExecFile(cmd, args, options);
  return {
    stdout: (result.stdout ?? '').toString(),
    stderr: (result.stderr ?? '').toString(),
  };
}

/**
 * Spawn `cmd`, write `input` to its stdin, and resolve/reject with the same shape
 * `promisify(execFile)` produces so existing error handling keeps working unchanged.
 */
function execFileWithStdin(
  cmd: string,
  args: string[],
  options: ExecFileOptions,
  input: string
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: options.cwd,
      env: options.env,
      // Never `shell: true` — that would reintroduce an argv/quoting surface for the payload.
      shell: false,
    });

    const maxBuffer = options.maxBuffer ?? 1024 * 1024 * 10;
    let stdout = '';
    let stderr = '';
    let killed = false;
    let settled = false;

    // `cmd` only — args are safe here (the payload went to stdin), but keeping the label short
    // matches what callers strip and avoids re-leaking long argv into messages.
    const label = `${cmd} ${args.join(' ')}`;

    // On timeout the promise is settled HERE rather than by waiting for 'close'. Killing the
    // child does not reliably close its stdio on Windows — a grandchild can hold the pipes open,
    // and 'close' then never fires, so the caller hangs until some outer timeout instead of
    // getting the timeout it asked for. Rejecting immediately after the kill is both deterministic
    // and what execFile's own timeout reports. Any output still in flight is lost, which is the
    // correct trade: a hung node is a stalled pipeline, and a timeout has no verdict to preserve.
    const timer =
      options.timeout != null && options.timeout > 0
        ? setTimeout(() => {
            killed = true;
            child.kill('SIGKILL');
            finish(() => {
              const err: SubprocessError = new Error(
                `Command failed: ${label}\nterminated after timeout`
              );
              err.code = 'ETIMEDOUT';
              err.killed = true;
              err.stdout = stdout;
              err.stderr = stderr;
              err.cmd = label;
              reject(err);
            });
          }, options.timeout)
        : undefined;

    const finish = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      fn();
    };

    child.stdout.on('data', (chunk: Buffer) => {
      if (stdout.length < maxBuffer) stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < maxBuffer) stderr += chunk.toString();
    });

    // A child that exits without reading stdin makes the write fail with EPIPE. That is not an
    // error of the run — the process still has its own exit code and output, which is what the
    // caller wants — so it is swallowed here and the outcome decided by 'close' below.
    child.stdin.on('error', () => undefined);

    child.on('error', (err: NodeJS.ErrnoException) => {
      finish(() => {
        const wrapped: SubprocessError = Object.assign(err, {
          stdout,
          stderr,
          cmd: label,
          killed,
        });
        reject(wrapped);
      });
    });

    child.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
      finish(() => {
        if (code === 0 && !killed) {
          resolve({ stdout, stderr });
          return;
        }
        const err: SubprocessError = new Error(
          killed ? `Command failed: ${label}\nterminated after timeout` : `Command failed: ${label}`
        );
        // Node reports the numeric exit code, or the signal name when killed by one.
        err.code = code ?? signal ?? 1;
        err.killed = killed;
        err.stdout = stdout;
        err.stderr = stderr;
        err.cmd = label;
        reject(err);
      });
    });

    child.stdin.end(input);
  });
}

/** Wrapper around fs.mkdir for test mockability */
export async function mkdirAsync(path: string, options?: { recursive?: boolean }): Promise<void> {
  await fsMkdir(path, options);
}
