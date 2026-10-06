/**
 * Runtime configuration: CLI flags, env vars, optional .jekyll-mcp.json
 */

import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml"; // yaml package also handles JSON-ish
import {
  DEFAULT_BUILD_TIMEOUT_MS,
  DEFAULT_MAX_FILE_SIZE,
  DEFAULT_MAX_SCAN_DEPTH,
  DEFAULT_PATHS,
  DEFAULT_WRITE_MODE,
  WRITE_MODES,
  type WriteMode,
} from "./constants.js";
import { resolveProjectRoot } from "../security/path-policy.js";
import { logger } from "../utils/logger.js";

export interface BuildConfig {
  command: string;
  timeout: number;
}

export interface PathOverrides {
  components?: string;
  sections?: string;
  layouts?: string;
  includes?: string;
  scss?: string;
  scssComponents?: string;
  scssSections?: string;
  js?: string;
  jsComponents?: string;
  docs?: string;
  docsComponents?: string;
  examples?: string;
  examplesComponents?: string;
  data?: string;
  posts?: string;
  sass?: string;
  assets?: string;
  site?: string;
}

export interface McpConfig {
  root: string;
  writeMode: WriteMode;
  build: BuildConfig;
  paths: typeof DEFAULT_PATHS & PathOverrides;
  maxFileSize: number;
  maxScanDepth: number;
  debug: boolean;
  allowPackageManager: boolean;
}

export interface CliOptions {
  root?: string;
  writeMode?: WriteMode;
  timeout?: number;
  maxFileSize?: number;
  debug?: boolean;
  allowPackageManager?: boolean;
}

function loadConfigFile(root: string): Partial<McpConfig> {
  const candidates = [
    path.join(root, ".jekyll-mcp.json"),
    path.join(root, ".jekyll-mcp.yaml"),
    path.join(root, ".jekyll-mcp.yml"),
  ];

  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    try {
      const raw = fs.readFileSync(file, "utf8");
      const data = file.endsWith(".json")
        ? JSON.parse(raw)
        : parseYaml(raw);
      logger.debug("Loaded config file", { file });
      return data as Partial<McpConfig>;
    } catch (err) {
      logger.warn("Failed to parse config file", { file, error: String(err) });
    }
  }
  return {};
}

function parseWriteMode(value: unknown): WriteMode | undefined {
  if (typeof value === "string" && (WRITE_MODES as readonly string[]).includes(value)) {
    return value as WriteMode;
  }
  return undefined;
}

/**
 * Resolve full runtime configuration from CLI, env, and optional config file.
 */
export function resolveConfig(cli: CliOptions = {}): McpConfig {
  // Root resolution priority: CLI > env > config file (later) > cwd
  let rootCandidate =
    cli.root ??
    process.env.JEKYLL_PROJECT_ROOT ??
    process.env.JEKYLL_COMPONENT_MCP_ROOT ??
    process.cwd();

  // First pass: resolve root so we can load config file from it
  let root = resolveProjectRoot(rootCandidate);
  const fileConfig = loadConfigFile(root);

  // If config file specifies a different root, re-resolve
  if (fileConfig.root && fileConfig.root !== "." && fileConfig.root !== rootCandidate) {
    const fromFile = path.isAbsolute(fileConfig.root)
      ? fileConfig.root
      : path.resolve(root, fileConfig.root);
    root = resolveProjectRoot(fromFile);
  }

  const writeMode =
    cli.writeMode ??
    parseWriteMode(process.env.JEKYLL_MCP_WRITE_MODE) ??
    parseWriteMode(fileConfig.writeMode) ??
    DEFAULT_WRITE_MODE;

  const timeout =
    cli.timeout ??
    (process.env.JEKYLL_MCP_BUILD_TIMEOUT
      ? Number(process.env.JEKYLL_MCP_BUILD_TIMEOUT)
      : undefined) ??
    fileConfig.build?.timeout ??
    DEFAULT_BUILD_TIMEOUT_MS;

  const maxFileSize =
    cli.maxFileSize ??
    (process.env.JEKYLL_MCP_MAX_FILE_SIZE
      ? Number(process.env.JEKYLL_MCP_MAX_FILE_SIZE)
      : undefined) ??
    fileConfig.maxFileSize ??
    DEFAULT_MAX_FILE_SIZE;

  const debug =
    cli.debug === true ||
    process.env.JEKYLL_MCP_DEBUG === "1" ||
    process.env.JEKYLL_MCP_DEBUG === "true" ||
    fileConfig.debug === true;

  const allowPackageManager =
    cli.allowPackageManager === true ||
    process.env.JEKYLL_MCP_ALLOW_PM === "1" ||
    fileConfig.allowPackageManager === true;

  const paths = {
    ...DEFAULT_PATHS,
    ...(fileConfig.paths ?? {}),
  };

  const buildCommand =
    fileConfig.build?.command ??
    process.env.JEKYLL_MCP_BUILD_COMMAND ??
    "bundle exec jekyll build";

  return {
    root,
    writeMode,
    build: {
      command: buildCommand,
      timeout: Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_BUILD_TIMEOUT_MS,
    },
    paths,
    maxFileSize: Number.isFinite(maxFileSize) && maxFileSize > 0 ? maxFileSize : DEFAULT_MAX_FILE_SIZE,
    maxScanDepth: fileConfig.maxScanDepth ?? DEFAULT_MAX_SCAN_DEPTH,
    debug,
    allowPackageManager,
  };
}
