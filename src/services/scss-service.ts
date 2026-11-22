/**
 * SCSS listing, reading, and light-weight creation.
 */

import path from "node:path";
import type { ServerContext } from "../server/context.js";
import { assertWriteAllowed } from "../server/context.js";
import {
  safeExists,
  safeReadFile,
  safeWriteFile,
  safeWalk,
  safeUnlink,
} from "../utils/filesystem.js";
import { analyzeScss } from "../parsers/scss-parser.js";
import { detectScssArchitecture } from "../parsers/project-scanner.js";
import { logger } from "../utils/logger.js";
import { createUnifiedDiff } from "../utils/diff.js";

function assertScssPath(scssRoot: string, filePath: string): string {
  const normalized = path.posix.normalize(filePath);
  const relative = path.posix.relative(scssRoot, normalized);
  if (
    path.posix.isAbsolute(filePath) ||
    relative === "" ||
    relative === ".." ||
    relative.startsWith(`..${path.posix.sep}`) ||
    ![".scss", ".sass", ".css"].includes(path.posix.extname(normalized).toLowerCase())
  ) {
    throw new Error(`Path must reference an SCSS/CSS file under ${scssRoot}: ${filePath}`);
  }
  return normalized;
}

function importsTargetFile(source: string, importer: string, target: string): boolean {
  const importPattern = /^\s*@(use|forward|import)\s+["']([^"']+)["'][^;]*;/gm;
  const normalizedTarget = target.replace(/\.(scss|sass|css)$/i, "");
  let match: RegExpExecArray | null;
  while ((match = importPattern.exec(source)) !== null) {
    const importPath = match[2]!;
    if (/^(?:https?:|sass:|\/\/)/i.test(importPath)) continue;
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(importer), importPath));
    const withoutExtension = resolved.replace(/\.(scss|sass|css)$/i, "");
    const partialPath = path.posix.join(
      path.posix.dirname(withoutExtension),
      `_${path.posix.basename(withoutExtension).replace(/^_/, "")}`,
    );
    if (withoutExtension === normalizedTarget || partialPath === normalizedTarget) return true;
  }
  return false;
}

export class ScssService {
  constructor(private readonly ctx: ServerContext) {}

  list(): { files: string[]; architecture: string[] } {
    const root = this.ctx.config.root;
    const scssRoot = this.ctx.config.paths.scss;
    const files: string[] = [];
    if (safeExists(root, scssRoot)) {
      for (const e of safeWalk(root, scssRoot, {
        maxDepth: this.ctx.config.maxScanDepth,
        extensions: [".scss", ".sass", ".css"],
      })) {
        if (!e.isDirectory) files.push(e.relativePath);
      }
    }
    const architecture = detectScssArchitecture(root, scssRoot);
    return { files, architecture };
  }

  get(relativePath: string): {
    path: string;
    source: string;
    analysis: ReturnType<typeof analyzeScss>;
  } {
    const source = safeReadFile(this.ctx.config.root, relativePath, {
      maxSize: this.ctx.config.maxFileSize,
    });
    return {
      path: relativePath,
      source,
      analysis: analyzeScss(source),
    };
  }

  create(input: {
    name: string;
    category?: "component" | "section" | "utility" | "token";
    content?: string;
    dry_run?: boolean;
  }): {
    success: boolean;
    path?: string;
    dry_run?: boolean;
    operations?: Array<{ type: string; path: string }>;
    error?: { code: string; message: string };
  } {
    try {
      assertWriteAllowed(this.ctx, "create");
    } catch (err) {
      return {
        success: false,
        error: {
          code: (err as { code?: string }).code ?? "WRITE_MODE_DENIED",
          message: (err as Error).message,
        },
      };
    }

    const name = input.name.replace(/[^a-z0-9-_]/gi, "-").toLowerCase();
    const cat = input.category ?? "component";
    const paths = this.ctx.config.paths;
    let dir: string = paths.scss;
    if (cat === "component") {
      dir = paths.scssComponents ?? path.posix.join(paths.scss, "components");
    } else if (cat === "section") {
      dir = paths.scssSections ?? path.posix.join(paths.scss, "sections");
    }

    const filePath = path.posix.join(dir, `_${name}.scss`);
    const content =
      input.content ??
      `// ${cat}: ${name}\n.${name.replace(/^_/, "")} {\n  // TODO\n}\n`;

    if (input.dry_run) {
      return {
        success: true,
        dry_run: true,
        operations: [{ type: "create", path: filePath }],
      };
    }

    const result = safeWriteFile(this.ctx.config.root, filePath, content, {
      maxSize: this.ctx.config.maxFileSize,
    });
    this.ctx.invalidateCache();
    logger.info("scss_create", { path: result.path });
    return { success: true, path: result.path };
  }

  update(input: {
    path: string;
    content: string;
    dry_run?: boolean;
  }): {
    success: boolean;
    path?: string;
    dry_run?: boolean;
    operations?: Array<{ type: string; path: string }>;
    diff?: string;
    error?: { code: string; message: string };
  } {
    try {
      const scssRoot = this.ctx.config.paths.scss;
      const filePath = assertScssPath(scssRoot, input.path);
      if (!safeExists(this.ctx.config.root, filePath)) {
        return {
          success: false,
          error: { code: "NOT_FOUND", message: `SCSS file not found: ${filePath}` },
        };
      }
      const before = safeReadFile(this.ctx.config.root, filePath, {
        maxSize: this.ctx.config.maxFileSize,
      });
      const diff = createUnifiedDiff(filePath, before, input.content);

      if (input.dry_run) {
        return {
          success: true,
          path: filePath,
          dry_run: true,
          operations: diff ? [{ type: "update", path: filePath }] : [],
          diff,
        };
      }

      assertWriteAllowed(this.ctx, "update");
      const result = safeWriteFile(this.ctx.config.root, filePath, input.content, {
        maxSize: this.ctx.config.maxFileSize,
      });
      this.ctx.invalidateCache();
      logger.info("scss_update", { path: result.path });
      return { success: true, path: result.path };
    } catch (err) {
      return {
        success: false,
        error: {
          code: (err as { code?: string }).code ?? "SCSS_UPDATE_FAILED",
          message: (err as Error).message,
        },
      };
    }
  }

  delete(input: {
    path: string;
    confirm?: boolean;
    dry_run?: boolean;
  }): {
    success: boolean;
    path?: string;
    dry_run?: boolean;
    operations?: Array<{ type: string; path: string }>;
    diffs?: Array<{ path: string; diff: string }>;
    files_modified?: string[];
    error?: { code: string; message: string };
  } {
    const filesModified: string[] = [];
    try {
      const root = this.ctx.config.root;
      const scssRoot = this.ctx.config.paths.scss;
      const filePath = assertScssPath(scssRoot, input.path);
      if (!safeExists(root, filePath)) {
        return {
          success: false,
          error: { code: "NOT_FOUND", message: `SCSS file not found: ${filePath}` },
        };
      }

      const importers: Array<{ path: string; before: string; content: string }> = [];
      for (const entry of safeWalk(root, scssRoot, {
        maxDepth: this.ctx.config.maxScanDepth,
        extensions: [".scss", ".sass", ".css"],
      })) {
        if (entry.isDirectory || entry.relativePath === filePath) continue;
        const before = safeReadFile(root, entry.relativePath, {
          maxSize: this.ctx.config.maxFileSize,
        });
        if (!importsTargetFile(before, entry.relativePath, filePath)) continue;
        const content = before
          .split(/(?<=\n)/)
          .filter((line) => !importsTargetFile(line, entry.relativePath, filePath))
          .join("");
        importers.push({ path: entry.relativePath, before, content });
      }

      const diffs = [
        {
          path: filePath,
          diff: createUnifiedDiff(
            filePath,
            safeReadFile(root, filePath, { maxSize: this.ctx.config.maxFileSize }),
            "",
          ),
        },
        ...importers
        .map(({ path: importer, before, content }) => ({
          path: importer,
          diff: createUnifiedDiff(importer, before, content),
        }))
        .filter((entry) => entry.diff),
      ];
      const operations = [
        { type: "delete", path: filePath },
        ...diffs.map(({ path: importer }) => ({ type: "update", path: importer })),
      ];
      if (input.dry_run) {
        return { success: true, path: filePath, dry_run: true, operations, diffs };
      }
      if (!input.confirm) {
        return {
          success: false,
          error: {
            code: "CONFIRMATION_REQUIRED",
            message: "SCSS deletion requires confirm: true after reviewing a dry run.",
          },
        };
      }

      assertWriteAllowed(this.ctx, "destructive");
      for (const importer of importers) {
        if (importer.content !== importer.before) {
          const result = safeWriteFile(root, importer.path, importer.content, {
            maxSize: this.ctx.config.maxFileSize,
          });
          if (result.modified) filesModified.push(result.path);
        }
      }
      safeUnlink(root, filePath);
      filesModified.push(filePath);
      this.ctx.invalidateCache();
      logger.info("scss_delete", { path: filePath, importers: importers.length });
      return { success: true, path: filePath, files_modified: filesModified };
    } catch (err) {
      return {
        success: false,
        error: {
          code: (err as { code?: string }).code ?? "SCSS_DELETE_FAILED",
          message: (err as Error).message,
        },
        files_modified: filesModified,
      };
    }
  }
}
