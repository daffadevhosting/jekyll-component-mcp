/**
 * Safe subprocess execution with timeout and allowlist enforcement.
 */

import { spawn } from "node:child_process";
import { parseAllowedCommand } from "../security/command-policy.js";
import { logger } from "./logger.js";

export interface RunResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  command: string;
}

export interface RunOptions {
  cwd: string;
  timeoutMs: number;
  env?: NodeJS.ProcessEnv;
  /** Strip known secret-like patterns from captured output. */
  redactSecrets?: boolean;
}

const SECRET_PATTERNS = [
  /(?:api[_-]?key|token|secret|password|credential|auth)\s*[:=]\s*["']?[^\s"']+/gi,
  /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
  /ghp_[A-Za-z0-9]{20,}/g,
  /sk-[A-Za-z0-9]{20,}/g,
];

function redact(text: string): string {
  let out = text;
  for (const re of SECRET_PATTERNS) {
    out = out.replace(re, "[REDACTED]");
  }
  return out;
}

/**
 * Run an allowlisted command. Throws CommandPolicyError if not allowed.
 */
export function runAllowedCommand(
  command: string,
  options: RunOptions,
): Promise<RunResult> {
  const { cmd, args } = parseAllowedCommand(command);
  const start = Date.now();

  logger.debug("Executing allowlisted command", { command, cwd: options.cwd });

  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: options.cwd,
      env: {
        ...process.env,
        ...options.env,
        // Avoid leaking interactive prompts
        CI: "true",
        JEKYLL_ENV: process.env.JEKYLL_ENV ?? "development",
      },
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill("SIGTERM");
        setTimeout(() => {
          if (!settled) {
            try {
              child.kill("SIGKILL");
            } catch {
              /* ignore */
            }
          }
        }, 3000).unref();
      } catch {
        /* ignore */
      }
    }, options.timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    const finish = (code: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const durationMs = Date.now() - start;
      const redactSecrets = options.redactSecrets !== false;
      resolve({
        exitCode: timedOut ? 124 : code,
        stdout: redactSecrets ? redact(stdout) : stdout,
        stderr: redactSecrets ? redact(stderr) : stderr,
        durationMs,
        timedOut,
        command,
      });
    };

    child.on("error", (err) => {
      logger.error("Command spawn error", { command, error: String(err) });
      finish(1);
      // Attach error info into stderr for caller
      stderr += `\n[spawn error] ${String(err)}`;
    });

    child.on("close", (code) => {
      finish(code);
    });
  });
}
