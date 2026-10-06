/**
 * Liquid includes and layouts — read-only source inspection (never executes Liquid).
 */

import path from "node:path";
import type { ServerContext } from "../server/context.js";
import { safeExists, safeReadFile, safeWalk } from "../utils/filesystem.js";
import { analyzeLiquid, checkLiquidSyntax } from "../parsers/liquid-parser.js";
import { extractFrontMatter } from "../utils/yaml.js";

export interface LiquidFileInfo {
  name: string;
  path: string;
  kind: "include" | "layout" | "section";
}

export interface LiquidFileDetail extends LiquidFileInfo {
  source: string;
  frontMatter: Record<string, unknown>;
  analysis: ReturnType<typeof analyzeLiquid>;
  syntax: { errors: string[]; warnings: string[] };
}

function basenameNoExt(filePath: string): string {
  return path.basename(filePath, path.extname(filePath)).replace(/^_/, "");
}

export class LiquidService {
  constructor(private readonly ctx: ServerContext) {}

  listIncludes(): LiquidFileInfo[] {
    return this.listInDir(this.ctx.config.paths.includes, "include", 5);
  }

  listLayouts(): LiquidFileInfo[] {
    return this.listInDir(this.ctx.config.paths.layouts, "layout", 3);
  }

  listSections(): LiquidFileInfo[] {
    const sectionsPath = this.ctx.config.paths.sections;
    if (!safeExists(this.ctx.config.root, sectionsPath)) return [];
    return this.listInDir(sectionsPath, "section", 3);
  }

  private listInDir(
    relDir: string,
    kind: LiquidFileInfo["kind"],
    maxDepth: number,
  ): LiquidFileInfo[] {
    const root = this.ctx.config.root;
    if (!safeExists(root, relDir)) return [];
    const out: LiquidFileInfo[] = [];
    for (const e of safeWalk(root, relDir, {
      maxDepth,
      extensions: [".html", ".liquid", ".md"],
    })) {
      if (e.isDirectory) continue;
      // Skip component subdir when listing generic includes (components have their own tools)
      if (kind === "include" && e.relativePath.includes("/components/")) continue;
      if (kind === "include" && e.relativePath.includes("/sections/")) continue;
      out.push({
        name: basenameNoExt(e.relativePath),
        path: e.relativePath,
        kind,
      });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  getInclude(nameOrPath: string): LiquidFileDetail | null {
    return this.getByNameOrPath(nameOrPath, "include");
  }

  getLayout(nameOrPath: string): LiquidFileDetail | null {
    return this.getByNameOrPath(nameOrPath, "layout");
  }

  private getByNameOrPath(
    nameOrPath: string,
    kind: "include" | "layout",
  ): LiquidFileDetail | null {
    const root = this.ctx.config.root;
    const list = kind === "include" ? this.listIncludes() : this.listLayouts();

    // Exact path match first
    let match = list.find((f) => f.path === nameOrPath || f.path.endsWith(`/${nameOrPath}`));
    if (!match) {
      const normalized = nameOrPath
        .toLowerCase()
        .replace(/\.(html|liquid|md)$/, "")
        .replace(/[_\s]+/g, "-");
      match = list.find(
        (f) =>
          f.name === normalized ||
          f.name === nameOrPath ||
          f.path.includes(normalized),
      );
    }
    if (!match) {
      // Try direct path under configured dir
      const baseDir =
        kind === "include" ? this.ctx.config.paths.includes : this.ctx.config.paths.layouts;
      const candidates = [
        nameOrPath,
        path.posix.join(baseDir, nameOrPath),
        path.posix.join(baseDir, `${nameOrPath}.html`),
        path.posix.join(baseDir, `${nameOrPath}.liquid`),
      ];
      for (const c of candidates) {
        if (safeExists(root, c)) {
          match = { name: basenameNoExt(c), path: c, kind };
          break;
        }
      }
    }
    if (!match) return null;

    const source = safeReadFile(root, match.path, {
      maxSize: this.ctx.config.maxFileSize,
    });
    const { data } = extractFrontMatter(source);
    return {
      ...match,
      source,
      frontMatter: data,
      analysis: analyzeLiquid(source),
      syntax: checkLiquidSyntax(source),
    };
  }
}
