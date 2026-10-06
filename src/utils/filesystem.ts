/**
 * Safe filesystem helpers that always go through path-policy.
 */

import fs from "node:fs";
import path from "node:path";
import { resolveSafePath, toRelative } from "../security/path-policy.js";
import { logger } from "./logger.js";

export interface ReadOptions {
  maxSize?: number;
  encoding?: BufferEncoding;
}

export interface WriteOptions {
  maxSize?: number;
  createDirs?: boolean;
  overwrite?: boolean;
}

export function safeExists(root: string, relativePath: string): boolean {
  try {
    const abs = resolveSafePath(root, relativePath);
    return fs.existsSync(abs);
  } catch {
    return false;
  }
}

export function safeStat(root: string, relativePath: string): fs.Stats | null {
  try {
    const abs = resolveSafePath(root, relativePath);
    return fs.statSync(abs);
  } catch {
    return null;
  }
}

export function safeReadFile(
  root: string,
  relativePath: string,
  options: ReadOptions = {},
): string {
  const abs = resolveSafePath(root, relativePath);
  const maxSize = options.maxSize ?? 2 * 1024 * 1024;
  const stat = fs.statSync(abs);
  if (!stat.isFile()) {
    throw new Error(`Not a file: ${toRelative(root, abs)}`);
  }
  if (stat.size > maxSize) {
    throw new Error(
      `File exceeds maximum size (${stat.size} > ${maxSize}): ${toRelative(root, abs)}`,
    );
  }
  return fs.readFileSync(abs, options.encoding ?? "utf8");
}

export function safeWriteFile(
  root: string,
  relativePath: string,
  content: string | Buffer,
  options: WriteOptions = {},
): { created: boolean; modified: boolean; path: string } {
  const abs = resolveSafePath(root, relativePath);
  const maxSize = options.maxSize ?? 2 * 1024 * 1024;
  const size = typeof content === "string" ? Buffer.byteLength(content, "utf8") : content.length;
  if (size > maxSize) {
    throw new Error(`Content exceeds maximum writable size (${size} > ${maxSize})`);
  }

  const existed = fs.existsSync(abs);
  if (existed && options.overwrite === false) {
    return { created: false, modified: false, path: toRelative(root, abs) };
  }

  if (options.createDirs !== false) {
    fs.mkdirSync(path.dirname(abs), { recursive: true });
  }

  let modified = true;
  if (existed) {
    try {
      const existing = fs.readFileSync(abs);
      const next = typeof content === "string" ? Buffer.from(content, "utf8") : content;
      if (existing.equals(next)) {
        modified = false;
      }
    } catch {
      // proceed with write
    }
  }

  if (modified || !existed) {
    fs.writeFileSync(abs, content, typeof content === "string" ? "utf8" : undefined);
    logger.debug(existed ? "Modified file" : "Created file", { path: toRelative(root, abs) });
  }

  return {
    created: !existed,
    modified,
    path: toRelative(root, abs),
  };
}

export function safeReadDir(
  root: string,
  relativePath: string,
  options: { withFileTypes?: boolean } = {},
): string[] | fs.Dirent[] {
  const abs = resolveSafePath(root, relativePath);
  if (options.withFileTypes) {
    return fs.readdirSync(abs, { withFileTypes: true });
  }
  return fs.readdirSync(abs);
}

export function safeMkdir(root: string, relativePath: string): string {
  const abs = resolveSafePath(root, relativePath);
  fs.mkdirSync(abs, { recursive: true });
  return toRelative(root, abs);
}

export function safeUnlink(root: string, relativePath: string): void {
  const abs = resolveSafePath(root, relativePath);
  if (fs.existsSync(abs)) {
    fs.unlinkSync(abs);
    logger.debug("Deleted file", { path: toRelative(root, abs) });
  }
}

/**
 * Walk directory under root with depth limit. Yields relative paths.
 */
export function* safeWalk(
  root: string,
  relativeDir: string,
  options: { maxDepth?: number; extensions?: string[] } = {},
): Generator<{ relativePath: string; absolutePath: string; isDirectory: boolean }> {
  const maxDepth = options.maxDepth ?? 12;
  const extensions = options.extensions?.map((e) => e.toLowerCase());

  function* walk(rel: string, depth: number): Generator<{
    relativePath: string;
    absolutePath: string;
    isDirectory: boolean;
  }> {
    if (depth > maxDepth) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(resolveSafePath(root, rel), { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name !== ".jekyll-mcp.json") continue;
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      const childAbs = resolveSafePath(root, childRel);
      if (entry.isDirectory()) {
        yield { relativePath: childRel, absolutePath: childAbs, isDirectory: true };
        yield* walk(childRel, depth + 1);
      } else if (entry.isFile()) {
        if (extensions) {
          const ext = path.extname(entry.name).toLowerCase();
          if (!extensions.includes(ext)) continue;
        }
        yield { relativePath: childRel, absolutePath: childAbs, isDirectory: false };
      }
    }
  }

  yield* walk(relativeDir === "." ? "" : relativeDir, 0);
}
