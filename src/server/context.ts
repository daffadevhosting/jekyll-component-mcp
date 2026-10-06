/**
 * Shared server context: config + lightweight caches.
 */

import type { McpConfig } from "../config/environment.js";
import type { WriteMode } from "../config/constants.js";

export interface ProjectCache {
  scanResult?: unknown;
  components?: unknown;
  tokens?: unknown;
  scannedAt?: number;
}

export interface ServerContext {
  config: McpConfig;
  cache: ProjectCache;
  invalidateCache: () => void;
}

export function createContext(config: McpConfig): ServerContext {
  const cache: ProjectCache = {};

  return {
    config,
    cache,
    invalidateCache() {
      cache.scanResult = undefined;
      cache.components = undefined;
      cache.tokens = undefined;
      cache.scannedAt = undefined;
    },
  };
}

export function assertWriteAllowed(
  ctx: ServerContext,
  operation: "create" | "update" | "delete" | "destructive",
): void {
  const mode: WriteMode = ctx.config.writeMode;
  if (mode === "read-only") {
    throw Object.assign(new Error("Server is in read-only mode; write operations are disabled."), {
      code: "WRITE_MODE_DENIED",
      details: { writeMode: mode, operation },
    });
  }
  if (operation === "delete" || operation === "destructive") {
    if (mode !== "full-write") {
      throw Object.assign(
        new Error(
          `Destructive operation "${operation}" requires full-write mode. Current mode: ${mode}.`,
        ),
        {
          code: "WRITE_MODE_DENIED",
          details: { writeMode: mode, operation },
        },
      );
    }
  }
}
