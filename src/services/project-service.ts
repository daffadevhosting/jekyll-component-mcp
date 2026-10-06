/**
 * High-level project inspection service.
 */

import type { ServerContext } from "../server/context.js";
import { scanProject, type ProjectScanResult } from "../parsers/project-scanner.js";
import { safeReadFile } from "../utils/filesystem.js";
import { parseYaml } from "../utils/yaml.js";
import { logger } from "../utils/logger.js";

export interface ProjectInfo {
  root: string;
  jekyll: boolean;
  config: boolean;
  layouts: number;
  includes: number;
  components: number;
  sections: number;
  scss: boolean;
  javascript: boolean;
  documentation: boolean;
  hasBundler: boolean;
  writeMode: string;
}

const SENSITIVE_CONFIG_KEYS = new Set([
  "api_key",
  "apikey",
  "secret",
  "token",
  "password",
  "credential",
  "private_key",
  "access_key",
  "auth",
  "aws",
  "github_token",
  "npm_token",
]);

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  for (const s of SENSITIVE_CONFIG_KEYS) {
    if (lower.includes(s)) return true;
  }
  return false;
}

function sanitizeConfig(obj: unknown, depth = 0): unknown {
  if (depth > 8) return "[truncated]";
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map((v) => sanitizeConfig(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (isSensitiveKey(k)) {
      out[k] = "[REDACTED]";
    } else {
      out[k] = sanitizeConfig(v, depth + 1);
    }
  }
  return out;
}

export class ProjectService {
  constructor(private readonly ctx: ServerContext) {}

  getInfo(): ProjectInfo {
    const scan = this.getScan();
    return {
      root: this.ctx.config.root,
      jekyll: scan.jekyll,
      config: scan.configFiles.length > 0,
      layouts: scan.layouts.length,
      includes: scan.includes.length,
      components: scan.components.length,
      sections: scan.sections.length,
      scss: scan.scssFiles.length > 0 || scan.directories.scss,
      javascript: scan.jsFiles.length > 0,
      documentation: scan.docsFiles.length > 0,
      hasBundler: scan.hasBundler,
      writeMode: this.ctx.config.writeMode,
    };
  }

  getScan(force = false): ProjectScanResult {
    if (!force && this.ctx.cache.scanResult) {
      return this.ctx.cache.scanResult as ProjectScanResult;
    }
    logger.debug("Scanning project", { root: this.ctx.config.root });
    const result = scanProject(this.ctx.config);
    this.ctx.cache.scanResult = result;
    this.ctx.cache.scannedAt = Date.now();
    return result;
  }

  getConfig(): { files: string[]; data: unknown } {
    const scan = this.getScan();
    const data: Record<string, unknown> = {};
    for (const file of scan.configFiles) {
      try {
        const raw = safeReadFile(this.ctx.config.root, file, {
          maxSize: this.ctx.config.maxFileSize,
        });
        if (file.endsWith(".yml") || file.endsWith(".yaml")) {
          data[file] = sanitizeConfig(parseYaml(raw));
        } else {
          data[file] = "[unsupported format]";
        }
      } catch (err) {
        data[file] = { error: String(err) };
      }
    }
    return { files: scan.configFiles, data };
  }
}
