/**
 * Allowlisted command runner. Never execute arbitrary model-supplied shell.
 */

import { ALLOWED_BUILD_COMMANDS, FORBIDDEN_COMMAND_TOKENS } from "../config/constants.js";
import { logger } from "../utils/logger.js";

export class CommandPolicyError extends Error {
  readonly code = "COMMAND_NOT_ALLOWED";
  constructor(
    message: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "CommandPolicyError";
  }
}

/**
 * Validate that a command string is on the allowlist and contains no forbidden tokens.
 */
export function assertAllowedCommand(command: string): void {
  const normalized = command.trim().replace(/\s+/g, " ");

  // Exact match against allowlist (case-sensitive for predictability)
  const allowed = (ALLOWED_BUILD_COMMANDS as readonly string[]).includes(normalized);
  if (!allowed) {
    logger.warn("Blocked non-allowlisted command", { command: normalized });
    throw new CommandPolicyError(
      `Command is not on the allowlist: "${normalized}". Only Jekyll build/clean/doctor commands are permitted.`,
      { command: normalized, allowed: [...ALLOWED_BUILD_COMMANDS] },
    );
  }

  // Defense-in-depth: reject any forbidden tokens even if somehow allowlisted
  const lower = normalized.toLowerCase();
  for (const token of FORBIDDEN_COMMAND_TOKENS) {
    if (lower.includes(token.toLowerCase())) {
      throw new CommandPolicyError(`Command contains forbidden token: ${token}`, {
        command: normalized,
        token,
      });
    }
  }
}

/**
 * Build a safe argv array for the given allowlisted command string.
 * Returns { cmd, args } suitable for child_process.spawn.
 */
export function parseAllowedCommand(command: string): { cmd: string; args: string[] } {
  assertAllowedCommand(command);
  const parts = command.trim().split(/\s+/);
  const cmd = parts[0]!;
  const args = parts.slice(1);
  return { cmd, args };
}
