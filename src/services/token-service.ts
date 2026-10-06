/**
 * Design token detection and updates (prefer CSS custom properties).
 */

import type { ServerContext } from "../server/context.js";
import { assertWriteAllowed } from "../server/context.js";
import { safeExists, safeReadFile, safeWriteFile, safeWalk } from "../utils/filesystem.js";
import { analyzeScss, type ScssToken } from "../parsers/scss-parser.js";

export class TokenService {
  constructor(private readonly ctx: ServerContext) {}

  list(): { tokens: ScssToken[]; files: string[] } {
    const root = this.ctx.config.root;
    const scssRoot = this.ctx.config.paths.scss;
    const tokens: ScssToken[] = [];
    const files: string[] = [];

    if (!safeExists(root, scssRoot)) {
      return { tokens, files };
    }

    for (const e of safeWalk(root, scssRoot, {
      maxDepth: 6,
      extensions: [".scss", ".sass", ".css"],
    })) {
      if (e.isDirectory) continue;
      const base = e.relativePath.toLowerCase();
      if (
        !base.includes("token") &&
        !base.includes("variable") &&
        !base.includes("abstract") &&
        !base.includes("_vars") &&
        !base.includes("theme")
      ) {
        continue;
      }
      try {
        const source = safeReadFile(root, e.relativePath, {
          maxSize: this.ctx.config.maxFileSize,
        });
        const analysis = analyzeScss(source);
        files.push(e.relativePath);
        tokens.push(...analysis.cssCustomProperties, ...analysis.variables);
      } catch {
        /* skip */
      }
    }

    return { tokens, files };
  }

  get(name: string): ScssToken[] {
    const { tokens } = this.list();
    const lower = name.toLowerCase().replace(/^--/, "").replace(/^\$/, "");
    return tokens.filter(
      (t) =>
        t.name.toLowerCase().includes(lower) ||
        t.category === lower,
    );
  }

  update(input: {
    file: string;
    name: string;
    value: string;
    dry_run?: boolean;
  }): {
    success: boolean;
    dry_run?: boolean;
    path?: string;
    error?: { code: string; message: string };
  } {
    try {
      assertWriteAllowed(this.ctx, "update");
    } catch (err) {
      return {
        success: false,
        error: {
          code: (err as { code?: string }).code ?? "WRITE_MODE_DENIED",
          message: (err as Error).message,
        },
      };
    }

    const root = this.ctx.config.root;
    if (!safeExists(root, input.file)) {
      return {
        success: false,
        error: { code: "NOT_FOUND", message: `File not found: ${input.file}` },
      };
    }

    const source = safeReadFile(root, input.file, {
      maxSize: this.ctx.config.maxFileSize,
    });

    const name = input.name.startsWith("--") || input.name.startsWith("$")
      ? input.name
      : `--${input.name}`;

    // Simple replace of existing declaration or append
    const re = new RegExp(
      `(${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:\\s*)([^;]+)(;)`,
    );
    let next: string;
    if (re.test(source)) {
      next = source.replace(re, `$1${input.value}$3`);
    } else {
      next = source.trimEnd() + `\n${name}: ${input.value};\n`;
    }

    if (input.dry_run) {
      return { success: true, dry_run: true, path: input.file };
    }

    safeWriteFile(root, input.file, next, { maxSize: this.ctx.config.maxFileSize });
    this.ctx.invalidateCache();
    return { success: true, path: input.file };
  }
}
