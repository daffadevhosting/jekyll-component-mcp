/**
 * Front matter validation and parsing for Jekyll documents.
 */

import { extractFrontMatter } from "../utils/yaml.js";

export interface FrontMatterIssue {
  field: string;
  level: "error" | "warning";
  message: string;
}

export interface FrontMatterResult {
  data: Record<string, unknown>;
  content: string;
  issues: FrontMatterIssue[];
  valid: boolean;
}

const KNOWN_FIELDS = new Set([
  "title",
  "description",
  "layout",
  "permalink",
  "date",
  "categories",
  "tags",
  "author",
  "image",
  "published",
  "sitemap",
  "robots",
  "excerpt",
  "slug",
  "name",
  "variant",
  "component",
]);

/**
 * Validate front matter. Prefer warnings over hard errors for optional fields.
 */
export function validateFrontMatter(source: string): FrontMatterResult {
  const { data, content } = extractFrontMatter(source);
  const issues: FrontMatterIssue[] = [];

  if (Object.keys(data).length === 0 && source.trimStart().startsWith("---")) {
    issues.push({
      field: "_root",
      level: "warning",
      message: "Front matter block appears present but could not be parsed",
    });
  }

  // Soft checks
  if (data.title !== undefined && typeof data.title !== "string") {
    issues.push({ field: "title", level: "warning", message: "title should be a string" });
  }
  if (data.layout !== undefined && typeof data.layout !== "string") {
    issues.push({ field: "layout", level: "warning", message: "layout should be a string" });
  }
  if (data.date !== undefined) {
    const d = data.date;
    if (!(d instanceof Date) && typeof d !== "string") {
      issues.push({ field: "date", level: "warning", message: "date should be a string or date" });
    }
  }
  if (data.permalink !== undefined && typeof data.permalink !== "string") {
    issues.push({
      field: "permalink",
      level: "warning",
      message: "permalink should be a string",
    });
  }

  // Unknown fields are fine in Jekyll; just note very unusual ones at debug level only
  for (const key of Object.keys(data)) {
    if (!KNOWN_FIELDS.has(key) && key.startsWith("_")) {
      // ignore private
    }
  }

  const hasErrors = issues.some((i) => i.level === "error");
  return {
    data,
    content,
    issues,
    valid: !hasErrors,
  };
}
