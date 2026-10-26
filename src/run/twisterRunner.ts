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

  get isRunning(): boolean {
    return this.child !== null && !this.child.killed;
  }

  cancel(): void {
    if (!this.child) {
      return;
    }
    this.cancelled = true;
    this.child.kill('SIGTERM');
    const child = this.child;
    setTimeout(() => {
      if (!child.killed) {
        child.kill('SIGKILL');
      }
    }, 3000);
  }

  async run(options: RunOptions): Promise<RunResult> {
    if (this.isRunning) {
      throw new Error('A ZTEST run is already in progress');
    }

    this.cancelled = false;
    const { cmd, args } = splitCommand(options.command);
    if (!cmd) {
      throw new Error('Empty run command');
    }

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
        reject(err);
      });

      this.child.on('close', (exitCode, signal) => {
        this.child = null;
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
