/**
 * Component CRUD, validation, and generation for the Jekyll Component Framework.
 */

import path from "node:path";
import type { Dirent } from "node:fs";
import type { ServerContext } from "../server/context.js";
import { assertWriteAllowed } from "../server/context.js";
import { normalizeComponentName } from "../security/validation.js";
import {
  safeExists,
  safeReadFile,
  safeWriteFile,
  safeUnlink,
  safeWalk,
  safeReadDir,
} from "../utils/filesystem.js";
import { analyzeLiquid, checkLiquidSyntax } from "../parsers/liquid-parser.js";
import { findImportForComponent } from "../parsers/scss-parser.js";
import { ProjectService } from "./project-service.js";
import { BuildService } from "./build-service.js";
import { ScssService } from "./scss-service.js";
import { logger } from "../utils/logger.js";
import { createUnifiedDiff } from "../utils/diff.js";

export interface ComponentDescriptor {
  name: string;
  category?: string;
  liquid?: string;
  scss?: string;
  javascript?: string;
  documentation?: string;
  example?: string;
}

export interface ComponentDetail extends ComponentDescriptor {
  liquidSource?: string;
  scssSource?: string;
  javascriptSource?: string;
  documentationSource?: string;
  parameters: ReturnType<typeof analyzeLiquid>["parameters"];
  variants: string[];
  accessibilityNotes: string[];
  classNames: string[];
}

export interface ComponentCatalogEntry extends ComponentDescriptor {
  category: string;
  status: "stable" | "draft" | "experimental";
  summary: string;
  tags: string[];
  hasDocumentation: boolean;
  hasExample: boolean;
  fileCount: number;
  parameters: ReturnType<typeof analyzeLiquid>["parameters"];
  variants: string[];
}

export interface CreateComponentInput {
  name: string;
  category?: string;
  variants?: string[];
  javascript?: boolean;
  documentation?: boolean;
  example?: boolean;
  dry_run?: boolean;
}

export interface MutationResult {
  success: boolean;
  operation: string;
  component?: string;
  files_created?: string[];
  files_modified?: string[];
  dry_run?: boolean;
  operations?: Array<{ type: string; path: string }>;
  diff?: string;
  diffs?: Array<{ path: string; diff: string }>;
  warnings?: string[];
  error?: { code: string; message: string; details?: unknown };
}

export interface PreviewInput {
  variant?: string;
  params?: Record<string, string | number | boolean | null | undefined>;
}

export interface PreviewResult {
  success: boolean;
  component: string;
  variant: string;
  html: string;
  classNames: string[];
  params: Record<string, string | number | boolean | null | undefined>;
  warnings?: string[];
  error?: { code: string; message: string; details?: unknown };
}

export interface ValidateResult {
  valid: boolean;
  component: string;
  errors: Array<{ file?: string; message: string }>;
  warnings: Array<{ file?: string; message: string }>;
}

type ComponentFileKey = "liquid" | "scss" | "javascript" | "documentation" | "example";

const COMPONENT_FILE_KEYS: ComponentFileKey[] = [
  "liquid",
  "scss",
  "javascript",
  "documentation",
  "example",
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceComponentReferences(
  source: string,
  oldName: string,
  newName: string,
  replacePlainName = true,
): string {
  const oldClass = `c-${oldName}`;
  const newClass = `c-${newName}`;
  const oldInit = componentInitFunction(oldName);
  const newInit = componentInitFunction(newName);
  const classPattern = new RegExp(
    `\\.${escapeRegExp(oldClass)}(?=__|--|[^a-zA-Z0-9_-]|$)`,
    "g",
  );
  const legacyClassPattern = new RegExp(
    `\\.${escapeRegExp(oldName)}(?=__|--|[^a-zA-Z0-9_-]|$)`,
    "g",
  );
  const plainPattern = new RegExp(
    `(^|[^a-zA-Z0-9])${escapeRegExp(oldName)}(?=$|[^a-zA-Z0-9])`,
    "g",
  );

  let updated = source
    .replace(classPattern, `.${newClass}`)
    .replace(legacyClassPattern, `.${newName}`)
    .replaceAll(`_${oldName}.scss`, `_${newName}.scss`)
    .replaceAll(`components/${oldName}`, `components/${newName}`)
    .replaceAll(oldInit, newInit);
  if (replacePlainName) updated = updated.replace(plainPattern, `$1${newName}`);
  return updated;
}

function isThicketProject(root: string, scssRoot: string): boolean {
  return (
    safeExists(root, path.posix.join(scssRoot, "_framework.scss")) &&
    safeExists(root, path.posix.join(scssRoot, "_tokens.scss"))
  );
}

function componentClassBase(name: string, thicket: boolean): string {
  if (!thicket) return name;
  return name.startsWith("c-") ? name : `c-${name}`;
}

function componentInitFunction(name: string): string {
  return `init${name.replace(/(^|-)(\w)/g, (_, __, c: string) => c.toUpperCase())}`;
}

function updateScssEntry(
  source: string,
  entry: string,
  scssRoot: string,
  scssPath: string,
  name: string,
): string | null {
  if (findImportForComponent(source, name).present) return null;

  const entryDir = path.posix.dirname(entry);
  let importPath = path.posix.relative(entryDir, scssPath).replace(/\.scss$/, "");
  if (!importPath.startsWith(".")) importPath = `./${importPath}`;
  if (entry === path.posix.join(scssRoot, "_framework.scss")) {
    importPath = path.posix.join("components", name);
  }
  importPath = importPath.replace(/\/_([^/]+)$/, "/$1");

  const line = `@use "${importPath}";\n`;
  return source.endsWith("\n") ? source + line : source + "\n" + line;
}

function updateThicketMainJs(
  source: string,
  initFunction: string,
  importPath: string,
): { source: string; warning?: never } | { source?: never; warning: string } {
  const importLine = `import { ${initFunction} } from '${importPath}';`;
  let next = source;

  const hasImport = next.split(/\r?\n/).some(
    (line) =>
      /^\s*import\b/.test(line) &&
      line.includes(importPath) &&
      line.includes(initFunction),
  );
  if (!hasImport) {
    const lines = next.split(/\r?\n/);
    let lastImport = -1;
    lines.forEach((line, index) => {
      if (/^\s*import\b/.test(line)) lastImport = index;
    });
    lines.splice(lastImport + 1, 0, importLine);
    next = lines.join("\n");
  }

  const listener =
    /(document\.addEventListener\(\s*(['"])DOMContentLoaded\2\s*,\s*\(\)\s*=>\s*\{)([\s\S]*?)(\n\s*\}\s*\);)/;
  const match = next.match(listener);
  if (!match) {
    return { warning: "Could not find a DOMContentLoaded initializer in the JavaScript entry point." };
  }
  if (!match[3]!.includes(`${initFunction}();`)) {
    const body = match[3]!.replace(/\s*$/, "");
    const updated = `${match[1]}${body}\n  ${initFunction}();${match[4]}`;
    next = next.replace(listener, updated);
  }

  return { source: next };
}

function defaultLiquidTemplate(name: string, variants: string[], classBase = name): string {
  const variantList = variants.length ? variants.join(", ") : "default";
  return `{% comment %}
  Component: ${name}
  Description: Reusable ${name} component.
  Parameters:
    - label: Optional visible label; defaults to an empty string.
    - variant: Visual variant (${variantList}); defaults to "default".
    - class: Optional extra CSS classes; defaults to an empty string.
    - id: Optional HTML id; rendered only when provided.
    - content: Optional nested Liquid/HTML content.
  Usage: {% include components/${name}.html label="Click me" variant="default" %}
{% endcomment %}
{% assign variant = include.variant | default: "default" %}
{% assign label = include.label | default: "" %}
{% assign extra_class = include.class | default: "" %}
{% assign content = include.content | default: "" %}

<div class="${classBase} ${classBase}--{{ variant | escape }} {{ extra_class | escape }}"{% if include.id %} id="{{ include.id | escape }}"{% endif %}>
  {% if label != blank %}
    <span class="${classBase}__label">{{ label | escape }}</span>
  {% endif %}
  {% if content != blank %}
    <div class="${classBase}__content">{{ content }}</div>
  {% endif %}
</div>
`;
}

function defaultScssTemplate(name: string, variants: string[], classBase = name): string {
  const lines = [
    `// Component: ${name}`,
    `.${classBase} {`,
    `  // Base styles`,
    ``,
    `  &__label {`,
    `    display: inline-block;`,
    `  }`,
    ``,
  ];
  for (const v of variants) {
    lines.push(`  &--${v} {`);
    lines.push(`    // variant: ${v}`);
    lines.push(`  }`);
    lines.push(``);
  }
  lines.push(`}`);
  lines.push(``);
  return lines.join("\n");
}

function defaultDocsTemplate(name: string, variants: string[], category = "general"): string {
  return `---
title: ${name}
category: ${category}
---

# ${name}

## Overview

Reusable \`${name}\` component for the Jekyll Component Framework.

## Usage

\`\`\`liquid
{% include components/${name}.html label="Example" variant="default" %}
\`\`\`

## Parameters

| Name | Type | Default | Description |
|------|------|---------|-------------|
| label | string | \`""\` | Visible label text |
| variant | string | \`"default"\` | Visual variant |
| class | string | \`""\` | Extra CSS classes |
| id | string | — | Optional element id |
| content | string | — | Nested content |

## Variants

${variants.map((v) => `- \`${v}\``).join("\n")}

## Example

See \`examples/components/${name}.html\`.

## Accessibility

- Ensure interactive variants expose keyboard support and focus styles.
- Prefer semantic HTML over ARIA when possible.

## Notes

Generated by jekyll-component-mcp.
`;
}

function defaultExampleTemplate(name: string): string {
  return `---
layout: default
title: ${name} example
---

{% include components/${name}.html label="Example ${name}" variant="default" %}
`;
}

function normalizeVariantValue(raw: string): string {
  const normalized = raw
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (!normalized) {
    throw new Error(`variant name contains no valid characters: ${String(raw)}`);
  }
  if (normalized.length > 32) {
    throw new Error(`variant name exceeds maximum length of 32 chars: ${normalized}`);
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized)) {
    throw new Error(`variant name must be kebab-case and alphanumeric: ${normalized}`);
  }

  return normalized;
}

function validateComponentSchema(input: {
  name: string;
  category?: string;
  variants?: string[];
}): string[] {
  const errors: string[] = [];
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) errors.push("Component name is required");

  if (typeof input.category === "string") {
    const category = input.category.trim();
    if (category.length === 0) {
      errors.push("Category cannot be empty");
    } else if (category.length > 64) {
      errors.push("Category must be 64 chars or fewer");
    }
  }

  const seen = new Set<string>();
  for (const rawVariant of input.variants ?? []) {
    if (typeof rawVariant !== "string") {
      errors.push("Variant entries must be strings");
      continue;
    }

    try {
      const variant = normalizeVariantValue(rawVariant);
      if (seen.has(variant)) {
        errors.push(`variant name must be unique after normalization: ${variant}`);
      } else {
        seen.add(variant);
      }
    } catch (err) {
      errors.push((err as Error).message);
    }
  }

  return errors;
}

function buildUnifiedDiff(relativePath: string, before: string, after: string): string {
  return createUnifiedDiff(relativePath, before, after);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export class ComponentService {
  private project: ProjectService;
  private build: BuildService;

  constructor(private readonly ctx: ServerContext) {
    this.project = new ProjectService(ctx);
    this.build = new BuildService(ctx);
  }

  list(): ComponentDescriptor[] {
    const scan = this.project.getScan();
    return scan.components;
  }

  getCatalog(): ComponentCatalogEntry[] {
    return this.list()
      .map((component) => {
        const detail = this.get(component.name);
        const categoryMatch = detail?.documentationSource?.match(/^category:\s*(.+)$/m);
        const category = (categoryMatch?.[1] ?? component.category ?? "general").trim();

        const tags = new Set<string>();
        const files = [
          component.liquid,
          component.scss,
          component.javascript,
          component.documentation,
          component.example,
        ].filter((value): value is string => Boolean(value));

        tags.add(category);
        if (component.scss) tags.add("scss");
        if (component.javascript) tags.add("javascript");
        if (component.documentation) tags.add("documented");
        if (component.example) tags.add("example");
        if ((detail?.variants ?? []).some((variant) => variant !== "default")) {
          tags.add("varianted");
        }
        if ((detail?.parameters ?? []).length > 0) tags.add("parameterized");

        let summary = "Reusable Jekyll component";
        if (detail?.documentationSource) {
          const overviewMatch = detail.documentationSource.match(
            /## Overview\s*\n+([\s\S]*?)(?:\n## |\n---|\n$)/,
          );
          if (overviewMatch) {
            summary = overviewMatch[1].trim().replace(/\s+/g, " ");
          } else {
            const firstLine = detail.documentationSource
              .replace(/^---[\s\S]*?---\s*/, "")
              .split(/\n+/)
              .find((line) => line.trim().length > 0);
            if (firstLine) summary = firstLine.replace(/^#+\s*/, "").trim();
          }
        }

        const status: ComponentCatalogEntry["status"] =
          component.liquid && component.scss && component.documentation ? "stable" :
          component.liquid ? "draft" : "experimental";

        return {
          ...component,
          category,
          status,
          summary,
          tags: [...tags],
          hasDocumentation: Boolean(component.documentation),
          hasExample: Boolean(component.example),
          fileCount: files.length,
          parameters: detail?.parameters ?? [],
          variants: detail?.variants ?? ["default"],
        };
      })
      .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  }

  get(name: string): ComponentDetail | null {
    const normalized = normalizeComponentName(name);
    const scan = this.project.getScan();
    const desc = scan.components.find((c) => c.name === normalized);
    if (!desc) return null;

    const root = this.ctx.config.root;
    const maxSize = this.ctx.config.maxFileSize;

    let liquidSource: string | undefined;
    let scssSource: string | undefined;
    let javascriptSource: string | undefined;
    let documentationSource: string | undefined;

    if (desc.liquid && safeExists(root, desc.liquid)) {
      liquidSource = safeReadFile(root, desc.liquid, { maxSize });
    }
    if (desc.scss && safeExists(root, desc.scss)) {
      scssSource = safeReadFile(root, desc.scss, { maxSize });
    }
    if (desc.javascript && safeExists(root, desc.javascript)) {
      javascriptSource = safeReadFile(root, desc.javascript, { maxSize });
    }
    if (desc.documentation && safeExists(root, desc.documentation)) {
      documentationSource = safeReadFile(root, desc.documentation, { maxSize });
    }

    const analysis = liquidSource ? analyzeLiquid(liquidSource) : null;
    const variants: string[] = [];
    if (liquidSource) {
      const variantMatches = liquidSource.matchAll(/--([a-z0-9-]+)/gi);
      for (const m of variantMatches) {
        if (m[1] && !variants.includes(m[1])) variants.push(m[1]);
      }
    }
    if (scssSource) {
      const scssVars = scssSource.matchAll(/&--([a-z0-9-]+)/gi);
      for (const m of scssVars) {
        if (m[1] && !variants.includes(m[1])) variants.push(m[1]);
      }
    }

    return {
      ...desc,
      liquidSource,
      scssSource,
      javascriptSource,
      documentationSource,
      parameters: analysis?.parameters ?? [],
      variants: variants.length ? variants : ["default"],
      accessibilityNotes: analysis?.accessibilityHints ?? [],
      classNames: analysis?.classNames ?? [],
    };
  }

  create(input: CreateComponentInput): MutationResult {
    const schemaErrors = validateComponentSchema({
      name: input.name,
      category: input.category,
      variants: input.variants,
    });
    if (schemaErrors.length > 0) {
      return {
        success: false,
        operation: "component_create",
        component: input.name,
        error: {
          code: "VALIDATION_ERROR",
          message: `Component schema validation failed: ${schemaErrors.join("; ")}`,
        },
      };
    }

    const name = normalizeComponentName(input.name);
    const variants = (input.variants?.length ? input.variants : ["default"]).map((v) =>
      normalizeVariantValue(v),
    );
    const category = (input.category ?? "general").trim() || "general";
    const dryRun = input.dry_run === true;
    const paths = this.ctx.config.paths;
    const root = this.ctx.config.root;
    const thicketProject = isThicketProject(root, paths.scss);
    const classBase = componentClassBase(name, thicketProject);

    try {
      assertWriteAllowed(this.ctx, "create");
    } catch (err) {
      return {
        success: false,
        operation: "component_create",
        error: {
          code: (err as { code?: string }).code ?? "WRITE_MODE_DENIED",
          message: (err as Error).message,
        },
      };
    }

    const liquidPath = path.posix.join(paths.components, `${name}.html`);
    const scssPath = path.posix.join(
      paths.scssComponents ?? path.posix.join(paths.scss, "components"),
      `_${name}.scss`,
    );
    const docsPath =
      input.documentation !== false
        ? path.posix.join(paths.docsComponents ?? path.posix.join(paths.docs, "components"), `${name}.md`)
        : null;
    const examplePath =
      input.example !== false
        ? path.posix.join(
            paths.examplesComponents ?? path.posix.join(paths.examples, "components"),
            `${name}.html`,
          )
        : null;
    const jsPath =
      input.javascript === true
        ? path.posix.join(paths.jsComponents ?? path.posix.join(paths.js, "components"), `${name}.js`)
        : null;

    const planned: Array<{ type: string; path: string }> = [
      { type: "create", path: liquidPath },
      { type: "create", path: scssPath },
    ];
    if (docsPath) planned.push({ type: "create", path: docsPath });
    if (examplePath) planned.push({ type: "create", path: examplePath });
    if (jsPath) planned.push({ type: "create", path: jsPath });

    const warnings: string[] = [];
    const integrationPreviewFiles: Array<{ path: string; content: string }> = [];
    if (dryRun) {
      const scssRegistration = this.previewScssImport(name, scssPath, warnings);
      if (scssRegistration) {
        planned.push({ type: "update", path: scssRegistration.path });
        integrationPreviewFiles.push(scssRegistration);
      }
    }
    if (dryRun && thicketProject && jsPath) {
      const jsRegistration = this.previewThicketJavascriptRegistration(name, jsPath, warnings);
      if (jsRegistration) {
        planned.push({ type: "update", path: jsRegistration.path });
        integrationPreviewFiles.push(jsRegistration);
      }
    }

    // Check collisions
    for (const p of planned) {
      if (p.type === "create" && safeExists(root, p.path)) {
        warnings.push(`File already exists and will be overwritten: ${p.path}`);
      }
    }

    if (dryRun) {
      const previewFiles = [
        { path: liquidPath, content: defaultLiquidTemplate(name, variants, classBase) },
        { path: scssPath, content: defaultScssTemplate(name, variants, classBase) },
      ];

      if (docsPath) {
        previewFiles.push({
          path: docsPath,
          content: defaultDocsTemplate(name, variants, category),
        });
      }
      if (examplePath) {
        previewFiles.push({ path: examplePath, content: defaultExampleTemplate(name) });
      }
      if (jsPath) {
        previewFiles.push({
          path: jsPath,
          content: `// Component: ${name}\nexport function ${componentInitFunction(name)}() {\n  // TODO\n}\n`,
        });
      }
      previewFiles.push(...integrationPreviewFiles);

      const diffs = previewFiles.map((entry) => ({
        path: entry.path,
        diff: buildUnifiedDiff(entry.path, "", entry.content),
      }));

      return {
        success: true,
        operation: "component_create",
        component: name,
        dry_run: true,
        operations: planned,
        diff: diffs.map((entry) => entry.diff).join("\n\n"),
        diffs,
        warnings,
      };
    }

    const filesCreated: string[] = [];
    const filesModified: string[] = [];

    try {
      const liquidResult = safeWriteFile(
        root,
        liquidPath,
        defaultLiquidTemplate(name, variants, classBase),
        { maxSize: this.ctx.config.maxFileSize },
      );
      if (liquidResult.created) filesCreated.push(liquidResult.path);
      else if (liquidResult.modified) filesModified.push(liquidResult.path);

      const scssResult = safeWriteFile(
        root,
        scssPath,
        defaultScssTemplate(name, variants, classBase),
        { maxSize: this.ctx.config.maxFileSize },
      );
      if (scssResult.created) filesCreated.push(scssResult.path);
      else if (scssResult.modified) filesModified.push(scssResult.path);

      if (docsPath) {
        const r = safeWriteFile(
          root,
          docsPath,
          defaultDocsTemplate(name, variants, category),
          { maxSize: this.ctx.config.maxFileSize },
        );
        if (r.created) filesCreated.push(r.path);
        else if (r.modified) filesModified.push(r.path);
      }

      if (examplePath) {
        const r = safeWriteFile(root, examplePath, defaultExampleTemplate(name), {
          maxSize: this.ctx.config.maxFileSize,
        });
        if (r.created) filesCreated.push(r.path);
        else if (r.modified) filesModified.push(r.path);
      }

      if (jsPath) {
        const r = safeWriteFile(
          root,
          jsPath,
          `// Component: ${name}\nexport function ${componentInitFunction(name)}() {\n  // TODO\n}\n`,
          { maxSize: this.ctx.config.maxFileSize },
        );
        if (r.created) filesCreated.push(r.path);
        else if (r.modified) filesModified.push(r.path);
      }

      // Try to register SCSS import in common entry points
      this.ensureScssImport(name, scssPath, warnings, filesModified);
      if (thicketProject && jsPath) {
        this.ensureThicketJavascriptRegistration(name, jsPath, warnings, filesModified);
      }

      this.ctx.invalidateCache();
      logger.info("component_create", { name, filesCreated });

      return {
        success: true,
        operation: "component_create",
        component: name,
        files_created: filesCreated,
        files_modified: filesModified,
        warnings,
      };
    } catch (err) {
      return {
        success: false,
        operation: "component_create",
        component: name,
        error: {
          code: "CREATE_FAILED",
          message: (err as Error).message,
        },
      };
    }
  }

  update(input: {
    name: string;
    liquid?: string;
    scss?: string;
    javascript?: string;
    documentation?: string;
    example?: string;
    dry_run?: boolean;
  }): MutationResult {
    const detail = this.get(input.name);
    if (!detail) {
      return {
        success: false,
        operation: "component_update",
        error: { code: "NOT_FOUND", message: `Component not found: ${input.name}` },
      };
    }

    const updates = COMPONENT_FILE_KEYS.flatMap((key) => {
      const content = input[key];
      const filePath = detail[key];
      return content !== undefined && filePath ? [{ key, path: filePath, content }] : [];
    });
    const requestedKeys = COMPONENT_FILE_KEYS.filter((key) => input[key] !== undefined);
    const missingKeys = requestedKeys.filter((key) => !detail[key]);
    if (missingKeys.length > 0) {
      return {
        success: false,
        operation: "component_update",
        component: detail.name,
        error: {
          code: "FILE_NOT_FOUND",
          message: `Component does not have associated files for: ${missingKeys.join(", ")}`,
        },
      };
    }
    if (updates.length === 0) {
      return {
        success: false,
        operation: "component_update",
        component: detail.name,
        error: { code: "NO_CHANGES", message: "Provide at least one component file source to update." },
      };
    }

    const root = this.ctx.config.root;
    const diffs = updates.map(({ path: filePath, content }) => ({
      path: filePath,
      before: safeReadFile(root, filePath, { maxSize: this.ctx.config.maxFileSize }),
      content,
    }));
    const changed = diffs.filter((item) => item.before !== item.content);
    if (input.dry_run) {
      return {
        success: true,
        operation: "component_update",
        component: detail.name,
        dry_run: true,
        operations: changed.map(({ path: filePath }) => ({ type: "update", path: filePath })),
        diffs: changed.map(({ path: filePath, before, content }) => ({
          path: filePath,
          diff: createUnifiedDiff(filePath, before, content),
        })),
        diff: changed
          .map(({ path: filePath, before, content }) =>
            createUnifiedDiff(filePath, before, content),
          )
          .filter(Boolean)
          .join("\n\n"),
      };
    }

    const filesModified: string[] = [];
    try {
      assertWriteAllowed(this.ctx, "update");
      for (const { path: filePath, content } of changed) {
        const result = safeWriteFile(root, filePath, content, {
          maxSize: this.ctx.config.maxFileSize,
        });
        if (result.modified) filesModified.push(result.path);
      }
      this.ctx.invalidateCache();
      return {
        success: true,
        operation: "component_update",
        component: detail.name,
        files_modified: filesModified,
      };
    } catch (err) {
      return {
        success: false,
        operation: "component_update",
        component: detail.name,
        error: {
          code: (err as { code?: string }).code ?? "UPDATE_FAILED",
          message: (err as Error).message,
        },
        files_modified: filesModified,
      };
    }
  }

  rename(input: {
    name: string;
    new_name: string;
    confirm?: boolean;
    dry_run?: boolean;
  }): MutationResult {
    const oldName = normalizeComponentName(input.name);
    const newName = normalizeComponentName(input.new_name);
    if (oldName === newName) {
      return {
        success: false,
        operation: "component_rename",
        error: { code: "INVALID_NAME", message: "The new name must differ from the current name." },
      };
    }
    const detail = this.get(oldName);
    if (!detail) {
      return {
        success: false,
        operation: "component_rename",
        error: { code: "NOT_FOUND", message: `Component not found: ${oldName}` },
      };
    }

    const root = this.ctx.config.root;
    const sources = COMPONENT_FILE_KEYS.flatMap((key) => {
      const filePath = detail[key];
      if (!filePath) return [];
      const content = safeReadFile(root, filePath, { maxSize: this.ctx.config.maxFileSize });
      const newPath = filePath.replace(
        new RegExp(`${escapeRegExp(oldName)}(?=\\.[^./]+$)`),
        newName,
      );
      return [{
        oldPath: filePath,
        newPath,
        before: content,
        content: replaceComponentReferences(content, oldName, newName),
      }];
    });
    if (sources.some(({ oldPath, newPath }) => oldPath === newPath)) {
      return {
        success: false,
        operation: "component_rename",
        component: oldName,
        error: { code: "INVALID_PATH", message: "Could not derive a new path for every component file." },
      };
    }
    const collisions = sources.filter(({ oldPath, newPath }) => newPath !== oldPath && safeExists(root, newPath));
    if (collisions.length > 0) {
      return {
        success: false,
        operation: "component_rename",
        component: oldName,
        error: {
          code: "TARGET_EXISTS",
          message: `Rename target already exists: ${collisions.map((item) => item.newPath).join(", ")}`,
        },
      };
    }

    const sourcePaths = new Set(sources.map(({ oldPath }) => oldPath));
    const referenceUpdates: Array<{ path: string; before: string; content: string }> = [];
    const searchRoots = [
      this.ctx.config.paths.includes,
      this.ctx.config.paths.layouts,
      this.ctx.config.paths.scss,
      this.ctx.config.paths.js,
      this.ctx.config.paths.docs,
      this.ctx.config.paths.examples,
      this.ctx.config.paths.posts,
      "_pages",
      "pages",
    ];
    const referencePaths = new Set<string>();
    for (const directory of searchRoots) {
      for (const entry of safeWalk(root, directory, {
        maxDepth: this.ctx.config.maxScanDepth,
        extensions: [".html", ".liquid", ".md", ".scss", ".sass", ".css", ".js", ".mjs", ".ts"],
      })) {
        if (!entry.isDirectory && !sourcePaths.has(entry.relativePath)) {
          referencePaths.add(entry.relativePath);
        }
      }
    }
    for (const entry of safeReadDir(root, ".", { withFileTypes: true }) as Dirent[]) {
      if (
        entry.isFile() &&
        [".html", ".liquid", ".md", ".scss", ".sass", ".css", ".js", ".mjs", ".ts"].includes(
          path.posix.extname(entry.name).toLowerCase(),
        )
      ) {
        referencePaths.add(entry.name);
      }
    }
    for (const filePath of referencePaths) {
      const before = safeReadFile(root, filePath, { maxSize: this.ctx.config.maxFileSize });
      const content = replaceComponentReferences(before, oldName, newName, false);
      if (content !== before) referenceUpdates.push({ path: filePath, before, content });
    }

    const operations = [
      ...sources.flatMap(({ oldPath, newPath }) => [
        { type: "create", path: newPath },
        { type: "delete", path: oldPath },
      ]),
      ...referenceUpdates.map(({ path: filePath }) => ({ type: "update", path: filePath })),
    ];
    const diffs = [
      ...sources.map(({ newPath, content }) => ({
        path: newPath,
        diff: createUnifiedDiff(newPath, "", content),
      })),
      ...sources.map(({ oldPath, before }) => ({
        path: oldPath,
        diff: createUnifiedDiff(oldPath, before, ""),
      })),
      ...referenceUpdates.map(({ path: filePath, before, content }) => ({
        path: filePath,
        diff: createUnifiedDiff(filePath, before, content),
      })),
    ];
    if (input.dry_run) {
      return {
        success: true,
        operation: "component_rename",
        component: oldName,
        dry_run: true,
        operations,
        diffs,
        diff: diffs.map((entry) => entry.diff).filter(Boolean).join("\n\n"),
      };
    }
    if (!input.confirm) {
      return {
        success: false,
        operation: "component_rename",
        component: oldName,
        error: {
          code: "CONFIRMATION_REQUIRED",
          message: "Renaming moves and removes source files; pass confirm: true after reviewing a dry run.",
        },
      };
    }

    const filesCreated: string[] = [];
    const filesModified: string[] = [];
    try {
      assertWriteAllowed(this.ctx, "destructive");
      for (const { newPath, content } of sources) {
        const result = safeWriteFile(root, newPath, content, {
          maxSize: this.ctx.config.maxFileSize,
          overwrite: false,
        });
        if (result.created) filesCreated.push(result.path);
      }
      for (const { path: filePath, content } of referenceUpdates) {
        const result = safeWriteFile(root, filePath, content, {
          maxSize: this.ctx.config.maxFileSize,
        });
        if (result.modified) filesModified.push(result.path);
      }
      for (const { oldPath } of sources) {
        safeUnlink(root, oldPath);
        filesModified.push(oldPath);
      }
      this.ctx.invalidateCache();
      return {
        success: true,
        operation: "component_rename",
        component: newName,
        files_created: filesCreated,
        files_modified: filesModified,
      };
    } catch (err) {
      return {
        success: false,
        operation: "component_rename",
        component: oldName,
        error: {
          code: (err as { code?: string }).code ?? "RENAME_FAILED",
          message: (err as Error).message,
        },
        files_created: filesCreated,
        files_modified: filesModified,
      };
    }
  }

  duplicate(input: { name: string; new_name: string; dry_run?: boolean }): MutationResult {
    const sourceName = normalizeComponentName(input.name);
    const newName = normalizeComponentName(input.new_name);
    if (sourceName === newName) {
      return {
        success: false,
        operation: "component_duplicate",
        error: { code: "INVALID_NAME", message: "The duplicate name must differ from the source name." },
      };
    }
    const detail = this.get(sourceName);
    if (!detail) {
      return {
        success: false,
        operation: "component_duplicate",
        error: { code: "NOT_FOUND", message: `Component not found: ${sourceName}` },
      };
    }
    const root = this.ctx.config.root;
    const files = COMPONENT_FILE_KEYS.flatMap((key) => {
      const filePath = detail[key];
      if (!filePath) return [];
      const newPath = filePath.replace(
        new RegExp(`${escapeRegExp(sourceName)}(?=\\.[^./]+$)`),
        newName,
      );
      return [{
        sourcePath: filePath,
        path: newPath,
        content: replaceComponentReferences(
          safeReadFile(root, filePath, { maxSize: this.ctx.config.maxFileSize }),
          sourceName,
          newName,
        ),
      }];
    });
    const collisions = files.filter(({ path: filePath }) => safeExists(root, filePath));
    if (collisions.length > 0) {
      return {
        success: false,
        operation: "component_duplicate",
        component: sourceName,
        error: {
          code: "TARGET_EXISTS",
          message: `Duplicate target already exists: ${collisions.map((item) => item.path).join(", ")}`,
        },
      };
    }
    const warnings: string[] = [];
    const integrationFiles: Array<{ path: string; content: string; before: string }> = [];
    const scssFilePath = files.find((file) => file.sourcePath === detail.scss)?.path;
    if (input.dry_run && scssFilePath) {
      const registration = this.previewScssImport(newName, scssFilePath, warnings);
      if (registration) {
        integrationFiles.push({
          ...registration,
          before: safeReadFile(root, registration.path, { maxSize: this.ctx.config.maxFileSize }),
        });
      }
    }
    const jsFilePath = files.find((file) => file.sourcePath === detail.javascript)?.path;
    if (
      input.dry_run &&
      jsFilePath &&
      isThicketProject(root, this.ctx.config.paths.scss)
    ) {
      const registration = this.previewThicketJavascriptRegistration(newName, jsFilePath, warnings);
      if (registration) {
        integrationFiles.push({
          ...registration,
          before: safeReadFile(root, registration.path, { maxSize: this.ctx.config.maxFileSize }),
        });
      }
    }
    const diffs = [
      ...files.map(({ path: filePath, content }) => ({
        path: filePath,
        diff: createUnifiedDiff(filePath, "", content),
      })),
      ...integrationFiles.map(({ path: filePath, before, content }) => ({
        path: filePath,
        diff: createUnifiedDiff(filePath, before, content),
      })),
    ];
    const operations = [
      ...files.map(({ path: filePath }) => ({ type: "create", path: filePath })),
      ...integrationFiles.map(({ path: filePath }) => ({ type: "update", path: filePath })),
    ];
    if (input.dry_run) {
      return {
        success: true,
        operation: "component_duplicate",
        component: newName,
        dry_run: true,
        operations,
        diffs,
        diff: diffs.map((entry) => entry.diff).filter(Boolean).join("\n\n"),
        warnings,
      };
    }

    const filesCreated: string[] = [];
    const filesModified: string[] = [];
    try {
      assertWriteAllowed(this.ctx, "create");
      for (const file of files) {
        const result = safeWriteFile(root, file.path, file.content, {
          maxSize: this.ctx.config.maxFileSize,
          overwrite: false,
        });
        if (result.created) filesCreated.push(result.path);
      }
      const scssFile = files.find((file) => file.path === detail.scss?.replace(
        new RegExp(`${escapeRegExp(sourceName)}(?=\\.[^./]+$)`),
        newName,
      ));
      if (scssFile) this.ensureScssImport(newName, scssFile.path, warnings, filesModified);
      if (detail.javascript && isThicketProject(root, this.ctx.config.paths.scss)) {
        const jsFile = files.find((file) => file.sourcePath === detail.javascript);
        if (jsFile) {
          this.ensureThicketJavascriptRegistration(newName, jsFile.path, warnings, filesModified);
        }
      }
      this.ctx.invalidateCache();
      return {
        success: true,
        operation: "component_duplicate",
        component: newName,
        files_created: filesCreated,
        files_modified: filesModified,
        warnings,
      };
    } catch (err) {
      return {
        success: false,
        operation: "component_duplicate",
        component: newName,
        error: {
          code: (err as { code?: string }).code ?? "DUPLICATE_FAILED",
          message: (err as Error).message,
        },
        files_created: filesCreated,
        files_modified: filesModified,
        warnings,
      };
    }
  }

  async test(name: string, runBuild = true): Promise<{
    success: boolean;
    component: string;
    validation: ValidateResult;
    build?: Awaited<ReturnType<BuildService["build"]>>;
  }> {
    const validation = this.validate(name);
    if (!validation.valid) {
      return { success: false, component: validation.component, validation };
    }
    const build = runBuild ? await this.build.build() : undefined;
    return {
      success: validation.valid && (build?.success ?? true),
      component: validation.component,
      validation,
      ...(build ? { build } : {}),
    };
  }

  dependencies(name: string): {
    component: string;
    dependencies: Array<{ name: string; files: string[] }>;
    dependents: Array<{ name: string; files: string[] }>;
  } | null {
    const target = normalizeComponentName(name);
    const components = this.list();
    const targetDetail = this.get(target);
    if (!targetDetail) return null;

    const referencesByComponent = new Map<string, Map<string, string[]>>();
    for (const component of components) {
      const detail = this.get(component.name);
      if (!detail) continue;
      const referenced = new Map<string, string[]>();
      for (const key of COMPONENT_FILE_KEYS) {
        const filePath = detail[key];
        const source = detail[`${key}Source` as keyof ComponentDetail];
        if (!filePath || typeof source !== "string") continue;
        const patterns = [
          /\{%\s*include\s+components\/([a-z0-9-]+)\.html\b/gi,
          /@(?:use|forward|import)\s+["'][^"']*components\/([a-z0-9-]+)/gi,
          /from\s+["'][^"']*components\/([a-z0-9-]+)(?:\.js)?["']/gi,
        ];
        for (const pattern of patterns) {
          let match: RegExpExecArray | null;
          while ((match = pattern.exec(source)) !== null) {
            const dependency = match[1]!;
            if (dependency === component.name) continue;
            const paths = referenced.get(dependency) ?? [];
            if (!paths.includes(filePath)) paths.push(filePath);
            referenced.set(dependency, paths);
          }
        }
      }
      referencesByComponent.set(component.name, referenced);
    }

    const dependencies = [...(referencesByComponent.get(target) ?? new Map()).entries()]
      .map(([dependencyName, files]) => ({ name: dependencyName, files }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const dependents = [...referencesByComponent.entries()]
      .flatMap(([componentName, references]) => {
        const files = references.get(target);
        return files ? [{ name: componentName, files }] : [];
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    return { component: target, dependencies, dependents };
  }

  export(name: string): {
    success: boolean;
    format: "jekyll-component-mcp/component-export@1";
    component: string;
    files: Array<{ path: string; content: string }>;
    error?: { code: string; message: string };
  } {
    const detail = this.get(name);
    if (!detail) {
      return {
        success: false,
        format: "jekyll-component-mcp/component-export@1",
        component: normalizeComponentName(name),
        files: [],
        error: { code: "NOT_FOUND", message: `Component not found: ${name}` },
      };
    }
    const files = COMPONENT_FILE_KEYS.flatMap((key) => {
      const filePath = detail[key];
      if (!filePath) return [];
      return [{
        path: filePath,
        content: safeReadFile(this.ctx.config.root, filePath, {
          maxSize: this.ctx.config.maxFileSize,
        }),
      }];
    });
    const totalBytes = files.reduce((total, file) => total + Buffer.byteLength(file.content), 0);
    if (totalBytes > this.ctx.config.maxFileSize) {
      return {
        success: false,
        format: "jekyll-component-mcp/component-export@1",
        component: detail.name,
        files: [],
        error: {
          code: "EXPORT_TOO_LARGE",
          message: `Component export exceeds the configured maximum size of ${this.ctx.config.maxFileSize} bytes.`,
        },
      };
    }
    return {
      success: true,
      format: "jekyll-component-mcp/component-export@1",
      component: detail.name,
      files,
    };
  }

  private previewScssImport(
    name: string,
    scssPath: string,
    warnings: string[],
  ): { path: string; content: string } | null {
    const root = this.ctx.config.root;
    const scssRoot = this.ctx.config.paths.scss;
    const candidates = [
      path.posix.join(scssRoot, "_framework.scss"),
      path.posix.join(scssRoot, "components", "_index.scss"),
      path.posix.join(scssRoot, "_components.scss"),
      path.posix.join(scssRoot, "main.scss"),
      path.posix.join(scssRoot, "app.scss"),
      path.posix.join(scssRoot, "style.scss"),
      path.posix.join(scssRoot, "styles.scss"),
      path.posix.join(scssRoot, "index.scss"),
    ];
    for (const entry of candidates) {
      if (!safeExists(root, entry)) continue;
      try {
        const source = safeReadFile(root, entry, { maxSize: this.ctx.config.maxFileSize });
        const content = updateScssEntry(source, entry, scssRoot, scssPath, name);
        return content ? { path: entry, content } : null;
      } catch (err) {
        warnings.push(`Could not preview SCSS registration in ${entry}: ${(err as Error).message}`);
        return null;
      }
    }
    warnings.push("No SCSS entry point found to register the component import.");
    return null;
  }

  private previewThicketJavascriptRegistration(
    name: string,
    jsPath: string,
    warnings: string[],
  ): { path: string; content: string } | null {
    const root = this.ctx.config.root;
    const entry = path.posix.join(this.ctx.config.paths.js, "main.js");
    if (!safeExists(root, entry)) {
      warnings.push(`Could not find ${entry} to register the JavaScript component.`);
      return null;
    }
    try {
      const source = safeReadFile(root, entry, { maxSize: this.ctx.config.maxFileSize });
      let importPath = path.posix.relative(path.posix.dirname(entry), jsPath);
      if (!importPath.startsWith(".")) importPath = `./${importPath}`;
      const update = updateThicketMainJs(source, componentInitFunction(name), importPath);
      if (!update.source) {
        warnings.push(`${update.warning} Register ${componentInitFunction(name)} manually in ${entry}.`);
        return null;
      }
      return update.source === source ? null : { path: entry, content: update.source };
    } catch (err) {
      warnings.push(`Could not preview JavaScript registration in ${entry}: ${(err as Error).message}`);
      return null;
    }
  }

  private ensureScssImport(
    name: string,
    scssPath: string,
    warnings: string[],
    filesModified: string[],
  ): void {
    const root = this.ctx.config.root;
    const paths = this.ctx.config.paths;
    const candidates = [
      path.posix.join(paths.scss, "_framework.scss"),
      path.posix.join(paths.scss, "components", "_index.scss"),
      path.posix.join(paths.scss, "_components.scss"),
      path.posix.join(paths.scss, "main.scss"),
      path.posix.join(paths.scss, "app.scss"),
      path.posix.join(paths.scss, "style.scss"),
      path.posix.join(paths.scss, "styles.scss"),
      path.posix.join(paths.scss, "index.scss"),
    ];

    for (const entry of candidates) {
      if (!safeExists(root, entry)) continue;
      try {
        const source = safeReadFile(root, entry, { maxSize: this.ctx.config.maxFileSize });
        const next = updateScssEntry(source, entry, paths.scss, scssPath, name);
        if (!next) {
          logger.debug("SCSS import already present", { entry, name });
          return;
        }
        const result = safeWriteFile(root, entry, next, { maxSize: this.ctx.config.maxFileSize });
        if (result.modified) filesModified.push(result.path);
        warnings.push(`Added SCSS import to ${entry}`);
        return;
      } catch (err) {
        warnings.push(`Could not update SCSS entry ${entry}: ${(err as Error).message}`);
      }
    }
    warnings.push(
      "No SCSS entry point found to register the component import. Add the import manually.",
    );
  }

  private ensureThicketJavascriptRegistration(
    name: string,
    jsPath: string,
    warnings: string[],
    filesModified: string[],
  ): void {
    const root = this.ctx.config.root;
    const paths = this.ctx.config.paths;
    const entry = path.posix.join(paths.js, "main.js");
    if (!safeExists(root, entry)) {
      warnings.push(`Could not find ${entry} to register the JavaScript component.`);
      return;
    }

    try {
      const source = safeReadFile(root, entry, { maxSize: this.ctx.config.maxFileSize });
      const initFunction = componentInitFunction(name);
      let importPath = path.posix.relative(path.posix.dirname(entry), jsPath);
      if (!importPath.startsWith(".")) importPath = `./${importPath}`;
      const update = updateThicketMainJs(source, initFunction, importPath);
      if (!update.source) {
        warnings.push(`${update.warning} Register ${initFunction} manually in ${entry}.`);
        return;
      }
      const next = update.source;
      if (next !== source) {
        const result = safeWriteFile(root, entry, next, { maxSize: this.ctx.config.maxFileSize });
        if (result.modified) filesModified.push(result.path);
      }
    } catch (err) {
      warnings.push(
        `Could not register the JavaScript component in ${entry}: ${(err as Error).message}`,
      );
    }
  }

  preview(name: string, input: PreviewInput = {}): PreviewResult {
    const detail = this.get(name);
    if (!detail) {
      return {
        success: false,
        component: normalizeComponentName(name),
        variant: input.variant ?? "default",
        html: "",
        classNames: [],
        params: {},
        error: {
          code: "NOT_FOUND",
          message: `Component not found: ${name}`,
        },
      };
    }

    const variant =
      input.variant && detail.variants.includes(input.variant)
        ? input.variant
        : detail.variants[0] ?? "default";
    const classBase = detail.classNames.some(
      (className) =>
        className === `c-${detail.name}` || className.startsWith(`c-${detail.name}--`),
    )
      ? `c-${detail.name}`
      : detail.name;
    const rawParams = input.params ?? {};
    const params = {
      label: rawParams.label ?? "Example",
      variant,
      class: rawParams.class ?? "",
      id: rawParams.id ?? "",
      content: rawParams.content ?? `<span class="${classBase}__content">Preview content</span>`,
    } as Record<string, string | number | boolean | null | undefined>;

    const classNames = [classBase, `${classBase}--${variant}`];
    const extraClass = typeof params.class === "string" ? params.class.trim() : "";
    if (extraClass) classNames.push(extraClass);

    const escapedLabel = escapeHtml(String(params.label));
    const contentMarkup = typeof params.content === "string" ? params.content : String(params.content);
    const renderedId = typeof params.id === "string" && params.id.trim() ? ` id="${escapeHtml(params.id.trim())}"` : "";

    const html = `
<div class="${classNames.join(" ")}"${renderedId}>
      <span class="${classBase}__label">${escapedLabel}</span>
  ${contentMarkup}
</div>
`.trim();

    return {
      success: true,
      component: detail.name,
      variant,
      html,
      classNames,
      params,
    };
  }

  validate(name: string): ValidateResult {
    const normalized = normalizeComponentName(name);
    const detail = this.get(normalized);
    const errors: ValidateResult["errors"] = [];
    const warnings: ValidateResult["warnings"] = [];

    if (!detail) {
      return {
        valid: false,
        component: normalized,
        errors: [{ message: `Component not found: ${normalized}` }],
        warnings: [],
      };
    }

    if (!detail.liquid) {
      errors.push({ message: "Missing Liquid include file" });
    } else if (detail.liquidSource) {
      const syntax = checkLiquidSyntax(detail.liquidSource);
      for (const e of syntax.errors) errors.push({ file: detail.liquid, message: e });
      for (const w of syntax.warnings) warnings.push({ file: detail.liquid, message: w });
      const analysis = analyzeLiquid(detail.liquidSource);
      for (const h of analysis.accessibilityHints) {
        warnings.push({ file: detail.liquid, message: h });
      }
      for (const parameter of analysis.parameters) {
        if (!parameter.hasDefault && !parameter.hasGuard) {
          warnings.push({
            file: detail.liquid,
            message: `include.${parameter.name} has no default fallback or if/unless guard`,
          });
        }
      }
    }

    if (!detail.scss) {
      warnings.push({ message: "No associated SCSS file detected" });
    } else {
      const expectedFilename = `_${normalized}.scss`;
      const expectedClass = normalized.startsWith("c-")
        ? escapeRegExp(normalized)
        : `(?:c-)?${escapeRegExp(normalized)}`;
      if (path.posix.basename(detail.scss) !== expectedFilename) {
        warnings.push({
          file: detail.scss,
          message: `SCSS filename should follow the BEM component name: ${expectedFilename}`,
        });
      }
      if (
        detail.scssSource &&
        !new RegExp(`\\.${expectedClass}(?:__[-\\w]+|--[-\\w]+)?\\s*(?:\\{|:)`).test(
          detail.scssSource,
        )
      ) {
        warnings.push({
          file: detail.scss,
          message: `SCSS should define a BEM selector beginning with .${normalized} or .c-${normalized.replace(/^c-/, "")}`,
        });
      }
    }

    if (!detail.documentation) {
      warnings.push({ message: "No documentation file detected" });
    }

    return {
      valid: errors.length === 0,
      component: normalized,
      errors,
      warnings,
    };
  }

  delete(name: string, confirm: boolean, dryRun = false): MutationResult {
    if (!confirm && !dryRun) {
      return {
        success: false,
        operation: "component_delete",
        error: {
          code: "CONFIRMATION_REQUIRED",
          message: "Destructive delete requires confirm: true",
        },
      };
    }

    const normalized = normalizeComponentName(name);
    const detail = this.get(normalized);
    if (!detail) {
      return {
        success: false,
        operation: "component_delete",
        error: { code: "NOT_FOUND", message: `Component not found: ${normalized}` },
      };
    }

    const root = this.ctx.config.root;
    const componentFiles = COMPONENT_FILE_KEYS.flatMap((key) => {
      const p = detail[key];
      return p && safeExists(root, p) ? [p] : [];
    });
    if (dryRun) {
      const scssDeletion = detail.scss
        ? new ScssService(this.ctx).delete({ path: detail.scss, dry_run: true })
        : null;
      if (scssDeletion && !scssDeletion.success) {
        return {
          success: false,
          operation: "component_delete",
          component: normalized,
          error: {
            code: scssDeletion.error?.code ?? "SCSS_DELETE_FAILED",
            message: scssDeletion.error?.message ?? "Could not preview component stylesheet deletion.",
          },
        };
      }
      const diffs = [
        ...componentFiles
          .filter((filePath) => filePath !== detail.scss)
          .map((filePath) => ({
            path: filePath,
            diff: createUnifiedDiff(
              filePath,
              safeReadFile(root, filePath, { maxSize: this.ctx.config.maxFileSize }),
              "",
            ),
          })),
        ...(scssDeletion?.diffs ?? []),
      ];
      return {
        success: true,
        operation: "component_delete",
        component: normalized,
        dry_run: true,
        operations: [
          ...componentFiles
            .filter((filePath) => filePath !== detail.scss)
            .map((filePath) => ({ type: "delete", path: filePath })),
          ...(scssDeletion?.operations ?? []),
        ],
        diffs,
        diff: diffs.map((entry) => entry.diff).filter(Boolean).join("\n\n"),
      };
    }

    const filesModified: string[] = [];
    try {
      assertWriteAllowed(this.ctx, "destructive");
      if (detail.scss) {
        const scssDeletion = new ScssService(this.ctx).delete({
          path: detail.scss,
          confirm: true,
        });
        if (!scssDeletion.success) {
          return {
            success: false,
            operation: "component_delete",
            component: normalized,
            error: {
              code: scssDeletion.error?.code ?? "SCSS_DELETE_FAILED",
              message: scssDeletion.error?.message ?? "Could not delete the component stylesheet.",
            },
            files_modified: scssDeletion.files_modified,
          };
        }
        filesModified.push(...(scssDeletion.files_modified ?? []));
      }
      for (const filePath of componentFiles) {
        if (filePath === detail.scss) continue;
        safeUnlink(root, filePath);
        filesModified.push(filePath);
      }
      this.ctx.invalidateCache();
      return {
        success: true,
        operation: "component_delete",
        component: normalized,
        files_modified: filesModified,
      };
    } catch (err) {
      return {
        success: false,
        operation: "component_delete",
        component: normalized,
        error: {
          code: (err as { code?: string }).code ?? "DELETE_FAILED",
          message: (err as Error).message,
        },
        files_modified: filesModified,
      };
    }
  }
}
