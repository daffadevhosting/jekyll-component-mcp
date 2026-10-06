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

function main(): void {
  const cli = parseArgs(process.argv.slice(2));
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

main();
