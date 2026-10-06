/**
 * SCSS source analysis for design tokens, imports, and architecture.
 */

export interface ScssToken {
  name: string;
  value: string;
  category: string;
  line?: number;
}

export interface ScssAnalysis {
  imports: string[];
  variables: ScssToken[];
  cssCustomProperties: ScssToken[];
  mixins: string[];
  selectors: string[];
  usesForward: boolean;
}

const IMPORT_RE = /@(?:import|use|forward)\s+["']([^"']+)["']/g;
const VAR_RE = /(\$[\w-]+)\s*:\s*([^;]+);/g;
const CSS_VAR_RE = /(--[\w-]+)\s*:\s*([^;]+);/g;
const MIXIN_RE = /@mixin\s+([\w-]+)/g;
const SELECTOR_RE = /^\s*([.#][\w-]+(?:\s*[.#][\w-]+)*)\s*\{/gm;

function categorizeToken(name: string): string {
  const n = name.toLowerCase();
  if (/color|colour|bg|background|fill|stroke|text-/.test(n)) return "color";
  if (/space|spacing|gap|margin|padding|inset/.test(n)) return "spacing";
  if (/radius|rounded|corner/.test(n)) return "radius";
  if (/shadow|elevation/.test(n)) return "shadow";
  if (/font|type|text-|line-height|letter/.test(n)) return "typography";
  if (/break|media|screen|container|viewport/.test(n)) return "breakpoints";
  if (/motion|transition|duration|easing|animation/.test(n)) return "motion";
  if (/z-index|layer/.test(n)) return "z-index";
  return "other";
}

export function analyzeScss(source: string): ScssAnalysis {
  const imports: string[] = [];
  let m: RegExpExecArray | null;
  const importRe = new RegExp(IMPORT_RE.source, "g");
  while ((m = importRe.exec(source)) !== null) {
    imports.push(m[1]!);
  }

  const variables: ScssToken[] = [];
  const varRe = new RegExp(VAR_RE.source, "g");
  while ((m = varRe.exec(source)) !== null) {
    variables.push({
      name: m[1]!,
      value: m[2]!.trim(),
      category: categorizeToken(m[1]!),
    });
  }

  const cssCustomProperties: ScssToken[] = [];
  const cssRe = new RegExp(CSS_VAR_RE.source, "g");
  while ((m = cssRe.exec(source)) !== null) {
    cssCustomProperties.push({
      name: m[1]!,
      value: m[2]!.trim(),
      category: categorizeToken(m[1]!),
    });
  }

  const mixins: string[] = [];
  const mixinRe = new RegExp(MIXIN_RE.source, "g");
  while ((m = mixinRe.exec(source)) !== null) {
    mixins.push(m[1]!);
  }

  const selectors: string[] = [];
  const selRe = new RegExp(SELECTOR_RE.source, "gm");
  while ((m = selRe.exec(source)) !== null) {
    selectors.push(m[1]!.trim());
  }

  return {
    imports,
    variables,
    cssCustomProperties,
    mixins,
    selectors,
    usesForward: /@forward\b/.test(source),
  };
}

/**
 * Detect whether a component SCSS file is already imported in an entry point.
 */
export function findImportForComponent(
  entrySource: string,
  componentName: string,
): { present: boolean; line?: string } {
  const patterns = [
    new RegExp(`["']components[/._]?${componentName}["']`),
    new RegExp(`["'][^"']*${componentName}["']`),
    new RegExp(`@import\\s+["'].*${componentName}`),
    new RegExp(`@use\\s+["'].*${componentName}`),
  ];
  for (const re of patterns) {
    if (re.test(entrySource)) {
      return { present: true };
    }
  }
  return { present: false };
}
