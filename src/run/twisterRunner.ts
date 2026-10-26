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

  get isRunning(): boolean {
    return this.busy;
  }

  cancel(): void {
    if (!this.child) {
      return;
    }
    this.cancelled = true;
    const child = this.child;
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
        // Escalate if still the same in-flight process
        if (pid !== undefined) {
          try {
            process.kill(pid, 0);
            child.kill('SIGKILL');
          } catch {
            // already exited
          }
        }
      } catch {
        // ignore
      }
    }, 3000);
  }

  async run(options: RunOptions): Promise<RunResult> {
    if (this.busy) {
      throw new Error('A ZTEST run is already in progress');
    }

    this.cancelled = false;
    const { cmd, args } = splitCommand(options.command);
    if (!cmd) {
      throw new Error('Empty run command');
    }

    this.busy = true;
    return new Promise<RunResult>((resolve, reject) => {
      let stdout = '';
      let stderr = '';

      try {
        this.child = spawn(cmd, args, {
          cwd: options.cwd,
          env: process.env,
          shell: false,
        });
      } catch (err) {
        this.child = null;
        this.busy = false;
        reject(err);
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
        this.child = null;
        this.busy = false;
        reject(err);
      });

      this.child.on('close', (exitCode, signal) => {
        this.child = null;
        this.busy = false;
        resolve({
          exitCode,
          signal,
          stdout,
          stderr,
          cancelled: this.cancelled,
        });
      });
    });
  }
}
