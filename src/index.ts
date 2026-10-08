#!/usr/bin/env node
/**
 * jekyll-component-mcp entry point.
 * stdout is reserved for MCP JSON-RPC. All logging goes to stderr.
 */

import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { resolveConfig, type CliOptions } from "./config/environment.js";
import { createContext } from "./server/context.js";
import { createServer } from "./server/create-server.js";
import { setLogLevel, logger } from "./utils/logger.js";
import { PACKAGE_NAME, PACKAGE_VERSION } from "./config/constants.js";
import {
  detectThemePreset,
  initializeProject,
  type ThemePreset,
} from "./cli/init.js";
import { createInterface } from "node:readline/promises";

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--root" && argv[i + 1]) {
      opts.root = argv[++i];
    } else if (a === "--readonly" || a === "--read-only") {
      opts.writeMode = "read-only";
    } else if (a === "--safe-write") {
      opts.writeMode = "safe-write";
    } else if (a === "--full-write") {
      opts.writeMode = "full-write";
    } else if (a === "--timeout" && argv[i + 1]) {
      opts.timeout = Number(argv[++i]);
    } else if (a === "--max-file-size" && argv[i + 1]) {
      opts.maxFileSize = Number(argv[++i]);
    } else if (a === "--debug") {
      opts.debug = true;
    } else if (a === "--allow-package-manager") {
      opts.allowPackageManager = true;
    } else if (a === "--help" || a === "-h") {
      console.error(`
${PACKAGE_NAME} v${PACKAGE_VERSION}

AI-native MCP server for Jekyll projects and reusable Liquid/SCSS/JS components.

Usage:
  jekyll-component-mcp [options]

Options:
  --root <path>           Project root (or set JEKYLL_PROJECT_ROOT)
  --readonly              Write mode: read-only
  --safe-write            Write mode: safe-write (default)
  --full-write            Write mode: full-write (allows destructive ops)
  --timeout <ms>          Build timeout in milliseconds (default 120000)
  --max-file-size <bytes> Max file size for read/write (default 2MiB)
  --debug                 Enable debug logging to stderr
  --allow-package-manager Allow package-manager commands when implemented
  -h, --help              Show this help

Security:
  All filesystem access is sandboxed to the project root.
  Commands are allowlisted (jekyll build/clean/doctor only).
  Destructive operations require full-write mode and confirm: true.
`);
      process.exit(0);
    }
  }
  return opts;
}

function isThemePreset(value: string): value is ThemePreset {
  return value === "standard" || value === "chirpy" || value === "minimal-mistakes";
}

async function runInit(argv: string[]): Promise<void> {
  let root = process.cwd();
  let preset: ThemePreset | undefined;
  let presetSpecified = false;
  let force = false;
  let yes = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--root" && argv[i + 1]) {
      root = argv[++i]!;
    } else if (arg === "--preset" && argv[i + 1]) {
      const value = argv[++i]!;
      if (value !== "auto" && !isThemePreset(value)) {
        throw new Error(`Unknown preset "${value}". Choose standard, chirpy, minimal-mistakes, or auto.`);
      }
      presetSpecified = true;
      if (value !== "auto") preset = value;
    } else if (arg === "--force") {
      force = true;
    } else if (arg === "--yes" || arg === "-y") {
      yes = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: jekyll-component-mcp init [options]

Create a .jekyll-mcp.json configuration for the current Jekyll project.

Options:
  --root <path>       Project directory (default: current directory)
  --preset <preset>   auto, standard, chirpy, or minimal-mistakes
  --force             Replace an existing .jekyll-mcp.json
  --yes, -y           Skip interactive preset selection
  -h, --help          Show this help`);
      return;
    } else {
      throw new Error(`Unknown init option: ${arg}`);
    }
  }

  const detectedPreset = detectThemePreset(root);
  if (!preset && !presetSpecified && !yes && process.stdin.isTTY) {
    const readline = createInterface({ input: process.stdin, output: process.stdout });
    try {
      const answer = await readline.question(
        `Detected ${detectedPreset} preset. Choose standard, chirpy, or minimal-mistakes [${detectedPreset}]: `,
      );
      if (answer.trim()) {
        const selectedPreset = answer.trim();
        if (!isThemePreset(selectedPreset)) {
          throw new Error("Preset must be standard, chirpy, or minimal-mistakes.");
        }
        preset = selectedPreset;
      }
    } finally {
      readline.close();
    }
  }

  const result = initializeProject(root, preset ?? detectedPreset, force);
  console.log(`Created ${result.configPath}`);
  console.log(`Theme preset: ${result.preset}`);
  console.log(`Component includes: ${result.paths.components}`);
  console.log(`SCSS components: ${result.paths.scssComponents}`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv[0] === "init") {
    await runInit(argv.slice(1));
    return;
  }

  const cli = parseArgs(argv);
  const config = resolveConfig(cli);

  if (config.debug) {
    setLogLevel("debug");
  }

  logger.info(`${PACKAGE_NAME} v${PACKAGE_VERSION} starting`, {
    root: config.root,
    writeMode: config.writeMode,
    buildTimeout: config.build.timeout,
  });

  const ctx = createContext(config);

  // serveStdio owns the transport; factory creates a fresh server per connection
  void serveStdio(() => createServer(ctx));
}

void main().catch((error: unknown) => {
  console.error(`${PACKAGE_NAME}: ${(error as Error).message}`);
  process.exitCode = 1;
});
