/**
 * SCSS listing, reading, and light-weight creation.
 */

import path from "node:path";
import type { ServerContext } from "../server/context.js";
import { assertWriteAllowed } from "../server/context.js";
import { safeExists, safeReadFile, safeWriteFile, safeWalk } from "../utils/filesystem.js";
import { analyzeScss } from "../parsers/scss-parser.js";
import { detectScssArchitecture } from "../parsers/project-scanner.js";
import { logger } from "../utils/logger.js";

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
}
