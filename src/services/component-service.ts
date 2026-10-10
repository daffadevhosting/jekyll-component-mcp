/**
 * Component CRUD, validation, and generation for the Jekyll Component Framework.
 */

import path from "node:path";
import type { ServerContext } from "../server/context.js";
import { assertWriteAllowed } from "../server/context.js";
import { normalizeComponentName } from "../security/validation.js";
import {
  safeExists,
  safeReadFile,
  safeWriteFile,
  safeUnlink,
} from "../utils/filesystem.js";
import { analyzeLiquid, checkLiquidSyntax } from "../parsers/liquid-parser.js";
import { findImportForComponent } from "../parsers/scss-parser.js";
import { ProjectService } from "./project-service.js";
import { logger } from "../utils/logger.js";

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

function defaultLiquidTemplate(name: string, variants: string[]): string {
  const classBase = name;
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

function defaultScssTemplate(name: string, variants: string[]): string {
  const lines = [
    `// Component: ${name}`,
    `.${name} {`,
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
  const beforeLines = before === "" ? [""] : before.split(/\r?\n/);
  const afterLines = after === "" ? [""] : after.split(/\r?\n/);

  const header = [`--- ${relativePath}`, `+++ ${relativePath}`];
  const lines = [...header, `@@ -0,0 +1,${afterLines.length} @@`];

  for (const line of afterLines) {
    lines.push(`+${line}`);
  }

  if (beforeLines.length > 0 && beforeLines.join("\n") !== afterLines.join("\n")) {
    lines.push(`@@ -1,${beforeLines.length} +1,${afterLines.length} @@`);
  }

  return lines.join("\n");
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

  constructor(private readonly ctx: ServerContext) {
    this.project = new ProjectService(ctx);
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

    // Check collisions
    const warnings: string[] = [];
    for (const p of planned) {
      if (safeExists(root, p.path)) {
        warnings.push(`File already exists and will be overwritten: ${p.path}`);
      }
    }

    if (dryRun) {
      const previewFiles = [
        { path: liquidPath, content: defaultLiquidTemplate(name, variants) },
        { path: scssPath, content: defaultScssTemplate(name, variants) },
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
          content: `// Component: ${name}\nexport function init${name.replace(/(^|-)(\w)/g, (_, __, c: string) => c.toUpperCase())}() {\n  // TODO\n}\n`,
        });
      }

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
        defaultLiquidTemplate(name, variants),
        { maxSize: this.ctx.config.maxFileSize },
      );
      if (liquidResult.created) filesCreated.push(liquidResult.path);
      else if (liquidResult.modified) filesModified.push(liquidResult.path);

      const scssResult = safeWriteFile(
        root,
        scssPath,
        defaultScssTemplate(name, variants),
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
          `// Component: ${name}\nexport function init${name.replace(/(^|-)(\w)/g, (_, __, c: string) => c.toUpperCase())}() {\n  // TODO\n}\n`,
          { maxSize: this.ctx.config.maxFileSize },
        );
        if (r.created) filesCreated.push(r.path);
        else if (r.modified) filesModified.push(r.path);
      }

      // Try to register SCSS import in common entry points
      this.ensureScssImport(name, scssPath, warnings);

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

  private ensureScssImport(name: string, scssPath: string, warnings: string[]): void {
    const root = this.ctx.config.root;
    const paths = this.ctx.config.paths;
    const candidates = [
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
        const found = findImportForComponent(source, name);
        if (found.present) {
          logger.debug("SCSS import already present", { entry, name });
          return;
        }
        // Prefer @use with relative path from entry
        const entryDir = path.posix.dirname(entry);
        let importPath = path.posix.relative(entryDir, scssPath).replace(/\.scss$/, "");
        if (!importPath.startsWith(".")) importPath = `./${importPath}`;
        // Strip leading underscore for Sass convention
        importPath = importPath.replace(/\/_([^/]+)$/, "/$1");

        const line = `@use "${importPath}";\n`;
        const next = source.endsWith("\n") ? source + line : source + "\n" + line;
        safeWriteFile(root, entry, next, { maxSize: this.ctx.config.maxFileSize });
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
    const rawParams = input.params ?? {};
    const params = {
      label: rawParams.label ?? "Example",
      variant,
      class: rawParams.class ?? "",
      id: rawParams.id ?? "",
      content: rawParams.content ?? `<span class="${detail.name}__content">Preview content</span>`,
    } as Record<string, string | number | boolean | null | undefined>;

    const classNames = [detail.name, `${detail.name}--${variant}`];
    const extraClass = typeof params.class === "string" ? params.class.trim() : "";
    if (extraClass) classNames.push(extraClass);

    const escapedLabel = escapeHtml(String(params.label));
    const contentMarkup = typeof params.content === "string" ? params.content : String(params.content);
    const renderedId = typeof params.id === "string" && params.id.trim() ? ` id="${escapeHtml(params.id.trim())}"` : "";

    const html = `
<div class="${classNames.join(" ")}"${renderedId}>
  <span class="${detail.name}__label">${escapedLabel}</span>
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
      if (path.posix.basename(detail.scss) !== expectedFilename) {
        warnings.push({
          file: detail.scss,
          message: `SCSS filename should follow the BEM component name: ${expectedFilename}`,
        });
      }
      if (
        detail.scssSource &&
        !new RegExp(`\\.${normalized}(?:__[-\\w]+|--[-\\w]+)?\\s*(?:\\{|:)`).test(
          detail.scssSource,
        )
      ) {
        warnings.push({
          file: detail.scss,
          message: `SCSS should define a BEM selector beginning with .${normalized}`,
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

  delete(name: string, confirm: boolean): MutationResult {
    if (!confirm) {
      return {
        success: false,
        operation: "component_delete",
        error: {
          code: "CONFIRMATION_REQUIRED",
          message: "Destructive delete requires confirm: true",
        },
      };
    }

    try {
      assertWriteAllowed(this.ctx, "destructive");
    } catch (err) {
      return {
        success: false,
        operation: "component_delete",
        error: {
          code: (err as { code?: string }).code ?? "WRITE_MODE_DENIED",
          message: (err as Error).message,
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
    const deleted: string[] = [];
    for (const key of ["liquid", "scss", "javascript", "documentation", "example"] as const) {
      const p = detail[key];
      if (p && safeExists(root, p)) {
        safeUnlink(root, p);
        deleted.push(p);
      }
    }

    this.ctx.invalidateCache();
    return {
      success: true,
      operation: "component_delete",
      component: normalized,
      files_modified: deleted,
    };
  }
}
