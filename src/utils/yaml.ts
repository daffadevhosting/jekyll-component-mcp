/**
 * YAML helpers using the `yaml` package.
 */

import { parse, stringify } from "yaml";

export function parseYaml<T = unknown>(text: string): T {
  return parse(text) as T;
}

export function stringifyYaml(value: unknown): string {
  return stringify(value, { lineWidth: 120 });
}

/**
 * Extract front matter from a Liquid/Markdown file.
 * Returns { data, content, rawFrontMatter }.
 */
export function extractFrontMatter(source: string): {
  data: Record<string, unknown>;
  content: string;
  rawFrontMatter: string | null;
} {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { data: {}, content: source, rawFrontMatter: null };
  }
  const raw = match[1] ?? "";
  let data: Record<string, unknown> = {};
  try {
    data = (parse(raw) as Record<string, unknown>) ?? {};
  } catch {
    data = {};
  }
  return {
    data,
    content: match[2] ?? "",
    rawFrontMatter: raw,
  };
}
