import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { splitCommand } from './commandBuilder';

export interface RunOptions {
  command: string;
  cwd: string;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
}

export interface RunResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  cancelled: boolean;
}

export class TwisterRunner {
  private child: ChildProcessWithoutNullStreams | null = null;
  private cancelled = false;
  /** True from spawn until close handler finishes — survives SIGTERM. */
  private busy = false;
  /** Resolves the in-flight run promise when force-reset mid-flight. */
  private settleInFlight: ((result: RunResult) => void) | null = null;

  get isRunning(): boolean {
    this.reapIfChildGone();
    return this.busy;
  }

  /** True when Node still has a live child handle. */
  private childAlive(): boolean {
    const child = this.child;
    if (!child || child.killed) {
      return false;
    }
    if (child.exitCode !== null || child.signalCode !== null) {
      return false;
    }
    const pid = child.pid;
    if (pid === undefined) {
      return false;
    }
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  /** Clear busy if the child already exited without a close callback (stale). */
  private reapIfChildGone(): void {
    if (!this.busy) {
      return;
    }
    if (this.child && this.childAlive()) {
      return;
    }
    if (this.child && !this.childAlive()) {
      this.finish(null, null);
    }
  }

  private finish(
    exitCode: number | null,
    signal: NodeJS.Signals | null,
    stdout = '',
    stderr = ''
  ): void {
    const settle = this.settleInFlight;
    this.settleInFlight = null;
    this.child = null;
    this.busy = false;
    settle?.({
      exitCode,
      signal,
      stdout,
      stderr,
      cancelled: this.cancelled,
    });
  }

  /**
   * Cancel the run. If the child is already gone (or never attached) but busy
   * is stuck — e.g. after deleting build/`out` mid-run — force-clear state.
   */
  cancel(): void {
    this.cancelled = true;
    const child = this.child;
    if (!child || !this.childAlive()) {
      this.finish(null, 'SIGTERM');
      return;
    }
    try {
      child.kill('SIGTERM');
    } catch {
      // ignore
    }
    const pid = child.pid;
    setTimeout(() => {
      if (!this.busy || this.child !== child) {
        return;
      }
      try {
        if (pid !== undefined) {
          try {
            process.kill(pid, 0);
            child.kill('SIGKILL');
          } catch {
            // already exited — ensure we are not stuck busy
            this.finish(null, 'SIGKILL');
          }
        }
      } catch {
        this.finish(null, 'SIGKILL');
      }
    }, 3000);
  }

  /** Hard-clear runner state (Refresh / recovery after hung run). */
  forceReset(): void {
    this.cancelled = true;
    const child = this.child;
    if (child && this.childAlive()) {
      try {
        child.kill('SIGKILL');
      } catch {
        // ignore
      }
    }
    this.finish(null, 'SIGKILL');
  }

  async run(options: RunOptions): Promise<RunResult> {
    this.reapIfChildGone();
    if (this.busy) {
      throw new Error('A ZTEST run is already in progress');
    }

    this.cancelled = false;
    const { cmd, args } = splitCommand(options.command);
    if (!cmd) {
      throw new Error('Empty run command');
    }

    this.busy = true;
    return new Promise<RunResult>((resolve) => {
      let stdout = '';
      let stderr = '';
      this.settleInFlight = resolve;

      try {
        this.child = spawn(cmd, args, {
          cwd: options.cwd,
          env: process.env,
          shell: false,
        });
      } catch (err) {
        this.child = null;
        this.busy = false;
        this.settleInFlight = null;
        resolve({
          exitCode: 1,
          signal: null,
          stdout: '',
          stderr: err instanceof Error ? err.message : String(err),
          cancelled: false,
        });
        return;
      }

      this.child.stdout.setEncoding('utf8');
      this.child.stderr.setEncoding('utf8');

      this.child.stdout.on('data', (chunk: string) => {
        stdout += chunk;
        options.onStdout?.(chunk);
      });
      this.child.stderr.on('data', (chunk: string) => {
        stderr += chunk;
        options.onStderr?.(chunk);
      });

      this.child.on('error', (err) => {
        stderr += (stderr ? '\n' : '') + err.message;
        this.finish(1, null, stdout, stderr);
      });

      this.child.on('close', (exitCode, signal) => {
        this.finish(exitCode, signal, stdout, stderr);
      });
    });
  }
}
