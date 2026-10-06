/**
 * Safe JSON helpers.
 */

export function safeJsonParse<T = unknown>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export function safeJsonStringify(value: unknown, pretty = false): string {
  try {
    return JSON.stringify(value, null, pretty ? 2 : 0) ?? "null";
  } catch {
    return "null";
  }
}
