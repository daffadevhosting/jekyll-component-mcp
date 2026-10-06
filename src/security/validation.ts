/**
 * Input validation helpers for component names, paths, etc.
 */

import {
  COMPONENT_NAME_REGEX,
  MAX_COMPONENT_NAME_LENGTH,
} from "../config/constants.js";

export class ValidationError extends Error {
  readonly code = "VALIDATION_ERROR";
  constructor(
    message: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

/**
 * Normalize a component name to kebab-case.
 * Accepts: "Pricing Card", "pricing card", "pricing_card", "pricing-card"
 */
export function normalizeComponentName(raw: string): string {
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new ValidationError("Component name must be a non-empty string", { name: raw });
  }

  const normalized = raw
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (normalized.length === 0) {
    throw new ValidationError("Component name contains no valid characters", { name: raw });
  }

  if (normalized.length > MAX_COMPONENT_NAME_LENGTH) {
    throw new ValidationError(
      `Component name exceeds maximum length of ${MAX_COMPONENT_NAME_LENGTH}`,
      { name: normalized, length: normalized.length },
    );
  }

  if (!COMPONENT_NAME_REGEX.test(normalized)) {
    throw new ValidationError(
      "Component name must be kebab-case, start with a letter, and contain only lowercase letters, numbers, and hyphens",
      { name: normalized },
    );
  }

  // Reject reserved / unsafe names
  const reserved = new Set([
    "con", "prn", "aux", "nul", "com1", "lpt1", "node_modules", "package",
    "index", "main", "test", "spec",
  ]);
  if (reserved.has(normalized)) {
    throw new ValidationError(`Component name is reserved: ${normalized}`, { name: normalized });
  }

  return normalized;
}

/**
 * Assert that a value is a safe relative path segment (no traversal).
 */
export function assertSafeRelativeSegment(segment: string, label = "path segment"): void {
  if (typeof segment !== "string" || segment.trim() === "") {
    throw new ValidationError(`${label} must be a non-empty string`);
  }
  if (segment.includes("..") || segment.includes("/") || segment.includes("\\") || segment.includes("\0")) {
    throw new ValidationError(`${label} contains illegal characters`, { segment });
  }
}
