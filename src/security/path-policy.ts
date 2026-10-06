/**
 * Path sandbox: every filesystem operation must stay inside the project root.
 * Prevents path traversal, absolute path escape, and symlink escape.
 */

import fs from "node:fs";
import path from "node:path";
import { logger } from "../utils/logger.js";

export class PathEscapeError extends Error {
  readonly code = "PROJECT_ROOT_ESCAPE";
  constructor(
    message: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "PathEscapeError";
  }
}

/**
 * Resolve and canonicalize the project root. Must be an existing directory.
 */
export function resolveProjectRoot(rawRoot: string): string {
  const resolved = path.resolve(rawRoot);
  let real: string;
  try {
    real = fs.realpathSync(resolved);
  } catch (err) {
    throw new PathEscapeError(`Project root does not exist or is not accessible: ${resolved}`, {
      root: resolved,
      cause: String(err),
    });
  }
  const stat = fs.statSync(real);
  if (!stat.isDirectory()) {
    throw new PathEscapeError(`Project root is not a directory: ${real}`, { root: real });
  }
  return real;
}

/**
 * Resolve a path relative to root and ensure it stays inside the root.
 * Rejects absolute paths that escape, `..` traversal, and symlink escapes.
 *
 * @param root Absolute canonical project root
 * @param relativePath User-supplied path (relative preferred; absolute only if under root)
 * @returns Absolute path that is guaranteed to be under root
 */
export function resolveSafePath(root: string, relativePath: string): string {
  if (relativePath == null || relativePath === "") {
    throw new PathEscapeError("Path must not be empty", { path: relativePath });
  }

  // Normalize separators and reject null bytes
  const cleaned = relativePath.replace(/\0/g, "").replace(/\\/g, "/");

  // Disallow absolute paths that are not under root (we re-resolve below)
  const candidate = path.isAbsolute(cleaned)
    ? path.normalize(cleaned)
    : path.resolve(root, cleaned);

  // Canonicalize if the path already exists (follow symlinks)
  let realCandidate: string;
  try {
    if (fs.existsSync(candidate)) {
      realCandidate = fs.realpathSync(candidate);
    } else {
      // For non-existent paths, resolve the nearest existing ancestor and join remainder
      realCandidate = resolveNonExistentUnderRoot(root, candidate);
    }
  } catch (err) {
    throw new PathEscapeError(`Failed to resolve path safely: ${candidate}`, {
      path: candidate,
      cause: String(err),
    });
  }

  // Ensure real path is strictly under or equal to root
  const relative = path.relative(root, realCandidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    logger.warn("Path escape attempt blocked", { root, requested: relativePath, resolved: realCandidate });
    throw new PathEscapeError(
      "Requested path is outside the configured Jekyll project root.",
      { root, requested: relativePath, resolved: realCandidate },
    );
  }

  return realCandidate;
}

/**
 * Resolve a non-existent path by walking up to an existing ancestor,
 * realpath-ing that ancestor, then re-joining the remainder.
 */
function resolveNonExistentUnderRoot(root: string, candidate: string): string {
  const parts: string[] = [];
  let current = candidate;

  while (current !== root && current !== path.dirname(current)) {
    if (fs.existsSync(current)) {
      const realAncestor = fs.realpathSync(current);
      // Verify ancestor is under root
      const rel = path.relative(root, realAncestor);
      if (rel.startsWith("..") || path.isAbsolute(rel)) {
        throw new PathEscapeError("Path escapes project root via symlink or absolute reference.", {
          root,
          ancestor: realAncestor,
        });
      }
      return path.join(realAncestor, ...parts.reverse());
    }
    parts.push(path.basename(current));
    current = path.dirname(current);
  }

  // Everything is new under root
  if (current === root || path.relative(root, current) === "") {
    return path.join(root, ...parts.reverse());
  }

  throw new PathEscapeError("Path escapes project root.", { root, candidate });
}

/**
 * Return a path relative to root for display/logging (never absolute).
 */
export function toRelative(root: string, absolutePath: string): string {
  const rel = path.relative(root, absolutePath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return absolutePath; // should not happen if resolveSafePath was used
  }
  return rel.split(path.sep).join("/");
}

/**
 * Check whether a path (already resolved) is inside root.
 */
export function isInsideRoot(root: string, absolutePath: string): boolean {
  const rel = path.relative(root, absolutePath);
  return !rel.startsWith("..") && !path.isAbsolute(rel);
}
