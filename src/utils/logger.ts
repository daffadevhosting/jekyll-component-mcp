/**
 * Stderr-only logger. stdout is reserved exclusively for MCP JSON-RPC traffic.
 * NEVER use console.log in this process.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let currentLevel: LogLevel = "info";

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

export function getLogLevel(): LogLevel {
  return currentLevel;
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[currentLevel];
}

function formatMessage(level: LogLevel, message: string, meta?: unknown): string {
  const ts = new Date().toISOString();
  const prefix = `[MCP] ${ts} ${level.toUpperCase()}`;
  if (meta === undefined) {
    return `${prefix} ${message}`;
  }
  // Never log secrets; stringify carefully
  try {
    const safe = typeof meta === "string" ? meta : JSON.stringify(meta, null, 0);
    return `${prefix} ${message} ${safe}`;
  } catch {
    return `${prefix} ${message} [unserializable]`;
  }
}

export const logger = {
  debug(message: string, meta?: unknown): void {
    if (shouldLog("debug")) {
      console.error(formatMessage("debug", message, meta));
    }
  },
  info(message: string, meta?: unknown): void {
    if (shouldLog("info")) {
      console.error(formatMessage("info", message, meta));
    }
  },
  warn(message: string, meta?: unknown): void {
    if (shouldLog("warn")) {
      console.error(formatMessage("warn", message, meta));
    }
  },
  error(message: string, meta?: unknown): void {
    if (shouldLog("error")) {
      console.error(formatMessage("error", message, meta));
    }
  },
};
