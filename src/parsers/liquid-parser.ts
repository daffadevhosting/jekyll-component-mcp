/**
 * Liquid source analysis (never executes Liquid).
 * Detects include parameters, variants, and basic structural patterns.
 */

export interface LiquidParameter {
  name: string;
  usageCount: number;
  examples: string[];
}

export interface LiquidAnalysis {
  parameters: LiquidParameter[];
  hasCapture: boolean;
  hasIf: boolean;
  hasFor: boolean;
  hasInclude: boolean;
  hasAssign: boolean;
  classNames: string[];
  idAttributes: string[];
  interactiveElements: string[];
  accessibilityHints: string[];
}

const INCLUDE_PARAM_RE = /include\.([a-zA-Z_][a-zA-Z0-9_]*)/g;
const CLASS_RE = /class\s*=\s*["']([^"']+)["']/gi;
const ID_RE = /\bid\s*=\s*["']([^"']+)["']/gi;
const INTERACTIVE_RE = /<(button|a|input|select|textarea|details|summary)\b/gi;
const ARIA_RE = /\baria-[a-z-]+\s*=/gi;
const ROLE_RE = /\brole\s*=\s*["']([^"']+)["']/gi;

/**
 * Analyze Liquid component source for metadata useful to agents.
 */
export function analyzeLiquid(source: string): LiquidAnalysis {
  const paramMap = new Map<string, { count: number; examples: string[] }>();

  let m: RegExpExecArray | null;
  const paramRe = new RegExp(INCLUDE_PARAM_RE.source, "g");
  while ((m = paramRe.exec(source)) !== null) {
    const name = m[1]!;
    const entry = paramMap.get(name) ?? { count: 0, examples: [] };
    entry.count += 1;
    if (entry.examples.length < 3) {
      const start = Math.max(0, m.index - 20);
      const end = Math.min(source.length, m.index + m[0].length + 20);
      entry.examples.push(source.slice(start, end).replace(/\s+/g, " ").trim());
    }
    paramMap.set(name, entry);
  }

  const parameters: LiquidParameter[] = [...paramMap.entries()]
    .map(([name, v]) => ({ name, usageCount: v.count, examples: v.examples }))
    .sort((a, b) => b.usageCount - a.usageCount);

  const classNames = new Set<string>();
  const classRe = new RegExp(CLASS_RE.source, "gi");
  while ((m = classRe.exec(source)) !== null) {
    for (const c of m[1]!.split(/\s+/)) {
      if (c) classNames.add(c);
    }
  }

  const idAttributes = new Set<string>();
  const idRe = new RegExp(ID_RE.source, "gi");
  while ((m = idRe.exec(source)) !== null) {
    if (m[1]) idAttributes.add(m[1]);
  }

  const interactiveElements = new Set<string>();
  const intRe = new RegExp(INTERACTIVE_RE.source, "gi");
  while ((m = intRe.exec(source)) !== null) {
    interactiveElements.add(m[1]!.toLowerCase());
  }

  const accessibilityHints: string[] = [];
  if (interactiveElements.size > 0) {
    const hasAria = ARIA_RE.test(source) || ROLE_RE.test(source);
    if (!hasAria) {
      accessibilityHints.push(
        "Interactive elements present; consider ARIA attributes and keyboard support",
      );
    }
    if (interactiveElements.has("button") || interactiveElements.has("a")) {
      if (!/tabindex|@keydown|onkeydown|keyboard/i.test(source)) {
        accessibilityHints.push("Interactive component may lack explicit keyboard behavior");
      }
    }
  }

  return {
    parameters,
    hasCapture: /\{\%\s*capture\b/.test(source),
    hasIf: /\{\%\s*if\b/.test(source),
    hasFor: /\{\%\s*for\b/.test(source),
    hasInclude: /\{\%\s*include\b/.test(source),
    hasAssign: /\{\%\s*assign\b/.test(source),
    classNames: [...classNames],
    idAttributes: [...idAttributes],
    interactiveElements: [...interactiveElements],
    accessibilityHints,
  };
}

/**
 * Basic Liquid syntax pattern checks (not a full parser).
 */
export function checkLiquidSyntax(source: string): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  const openTags = (source.match(/\{\%/g) ?? []).length;
  const closeTags = (source.match(/\%\}/g) ?? []).length;
  if (openTags !== closeTags) {
    errors.push(`Unbalanced Liquid tags: ${openTags} opening vs ${closeTags} closing`);
  }

  const openOutput = (source.match(/\{\{/g) ?? []).length;
  const closeOutput = (source.match(/\}\}/g) ?? []).length;
  if (openOutput !== closeOutput) {
    errors.push(`Unbalanced Liquid output: ${openOutput} opening vs ${closeOutput} closing`);
  }

  // Detect common mistakes
  if (/\{\%\s*end(?!if|for|capture|unless|case|comment|raw|tablerow|paginate)\w*/.test(source)) {
    warnings.push("Possible misspelled end tag");
  }

  return { errors, warnings };
}
