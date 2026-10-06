/**
 * Jekyll build execution via allowlisted commands.
 */

import type { ServerContext } from "../server/context.js";
import { runAllowedCommand } from "../utils/shell.js";
import { safeExists } from "../utils/filesystem.js";
import { logger } from "../utils/logger.js";

export interface BuildResult {
  success: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  command: string;
  sitePath: string | null;
  error?: { code: string; message: string };
}

export class BuildService {
  constructor(private readonly ctx: ServerContext) {}

  async build(options: { clean?: boolean } = {}): Promise<BuildResult> {
    const { root, build } = this.ctx.config;
    let command = build.command;

    // Prefer bundle exec when Gemfile present and command is plain jekyll
    if (safeExists(root, "Gemfile") && command === "jekyll build") {
      command = "bundle exec jekyll build";
    }

    if (options.clean) {
      const cleanCmd = command.includes("bundle exec")
        ? "bundle exec jekyll clean"
        : "jekyll clean";
      logger.info("Running jekyll clean first");
      await runAllowedCommand(cleanCmd, {
        cwd: root,
        timeoutMs: Math.min(build.timeout, 60_000),
      });
    }

    logger.info("Running Jekyll build", { command });
    const result = await runAllowedCommand(command, {
      cwd: root,
      timeoutMs: build.timeout,
    });

    const sitePath = safeExists(root, this.ctx.config.paths.site)
      ? this.ctx.config.paths.site
      : null;

    if (result.timedOut) {
      return {
        success: false,
        ...result,
        sitePath,
        error: {
          code: "BUILD_TIMEOUT",
          message: `Jekyll build timed out after ${build.timeout}ms`,
        },
      };
    }

    if (result.exitCode !== 0) {
      return {
        success: false,
        ...result,
        sitePath,
        error: {
          code: "BUILD_FAILED",
          message: `Jekyll build exited with code ${result.exitCode}`,
        },
      };
    }

    return {
      success: true,
      ...result,
      sitePath,
    };
  }

  async doctor(): Promise<BuildResult> {
    const { root, build } = this.ctx.config;
    let command = "jekyll doctor";
    if (safeExists(root, "Gemfile")) {
      command = "bundle exec jekyll doctor";
    }
    const result = await runAllowedCommand(command, {
      cwd: root,
      timeoutMs: Math.min(build.timeout, 60_000),
    });
    return {
      success: result.exitCode === 0 && !result.timedOut,
      ...result,
      sitePath: null,
      error:
        result.exitCode !== 0
          ? { code: "DOCTOR_FAILED", message: "jekyll doctor reported issues" }
          : undefined,
    };
  }
}
