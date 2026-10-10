/**
 * Component documentation create / update.
 */

import path from "node:path";
import type { ServerContext } from "../server/context.js";
import { assertWriteAllowed } from "../server/context.js";
import { normalizeComponentName } from "../security/validation.js";
import { safeExists, safeReadFile, safeWriteFile } from "../utils/filesystem.js";
import { ComponentService } from "./component-service.js";
import { logger } from "../utils/logger.js";

function buildDocsMarkdown(input: {
  name: string;
  category?: string;
  overview?: string;
  parameters?: Array<{ name: string; type?: string; default?: string; description?: string }>;
  variants?: string[];
  usage?: string;
  accessibility?: string;
  notes?: string;
}): string {
  const params =
    input.parameters?.length
      ? input.parameters
      : [
          { name: "label", type: "string", default: '""', description: "Visible label" },
          { name: "variant", type: "string", default: '"default"', description: "Visual variant" },
          { name: "class", type: "string", default: '""', description: "Extra CSS classes" },
        ];

  const variants = input.variants?.length ? input.variants : ["default"];
  const usage =
    input.usage ??
    `{% include components/${input.name}.html label="Example" variant="default" %}`;

  return `---
title: ${input.name}
category: ${input.category ?? "general"}
---

# ${input.name}

## Overview

${input.overview ?? `Reusable \`${input.name}\` component for the Jekyll Component Framework.`}

## Usage

\`\`\`liquid
${usage}
\`\`\`

## Parameters

| Name | Type | Default | Description |
|------|------|---------|-------------|
${params
  .map(
    (p) =>
      `| ${p.name} | ${p.type ?? "string"} | ${p.default ?? "—"} | ${p.description ?? ""} |`,
  )
  .join("\n")}

## Variants

${variants.map((v) => `- \`${v}\``).join("\n")}

## Example

See \`examples/components/${input.name}.html\`.

## Accessibility

${input.accessibility ?? "- Prefer semantic HTML\n- Ensure keyboard support for interactive variants\n- Provide visible focus styles"}

## Notes

${input.notes ?? "Generated/updated by jekyll-component-mcp."}
`;
}

export class DocumentationService {
  private components: ComponentService;

  constructor(private readonly ctx: ServerContext) {
    this.components = new ComponentService(ctx);
  }

  create(input: {
    name: string;
    overview?: string;
    category?: string;
    variants?: string[];
    parameters?: Array<{ name: string; type?: string; default?: string; description?: string }>;
    dry_run?: boolean;
  }): {
    success: boolean;
    operation: string;
    path?: string;
    dry_run?: boolean;
    operations?: Array<{ type: string; path: string }>;
    error?: { code: string; message: string };
  } {
    try {
      assertWriteAllowed(this.ctx, "create");
    } catch (err) {
      return {
        success: false,
        operation: "docs_create",
        error: {
          code: (err as { code?: string }).code ?? "WRITE_MODE_DENIED",
          message: (err as Error).message,
        },
      };
    }

    const name = normalizeComponentName(input.name);
    const docsDir =
      this.ctx.config.paths.docsComponents ??
      path.posix.join(this.ctx.config.paths.docs, "components");
    const filePath = path.posix.join(docsDir, `${name}.md`);

    if (input.dry_run) {
      return {
        success: true,
        operation: "docs_create",
        dry_run: true,
        operations: [{ type: "create", path: filePath }],
      };
    }

    const content = buildDocsMarkdown({
      name,
      category: input.category ?? "general",
      overview: input.overview,
      variants: input.variants,
      parameters: input.parameters,
    });

    const result = safeWriteFile(this.ctx.config.root, filePath, content, {
      maxSize: this.ctx.config.maxFileSize,
    });
    this.ctx.invalidateCache();
    logger.info("docs_create", { path: result.path });
    return { success: true, operation: "docs_create", path: result.path };
  }

  update(input: {
    name: string;
    overview?: string;
    category?: string;
    variants?: string[];
    parameters?: Array<{ name: string; type?: string; default?: string; description?: string }>;
    accessibility?: string;
    notes?: string;
    dry_run?: boolean;
  }): {
    success: boolean;
    operation: string;
    path?: string;
    created?: boolean;
    modified?: boolean;
    dry_run?: boolean;
    error?: { code: string; message: string };
  } {
    try {
      assertWriteAllowed(this.ctx, "update");
    } catch (err) {
      return {
        success: false,
        operation: "docs_update",
        error: {
          code: (err as { code?: string }).code ?? "WRITE_MODE_DENIED",
          message: (err as Error).message,
        },
      };
    }

    const name = normalizeComponentName(input.name);
    const detail = this.components.get(name);
    const docsDir =
      this.ctx.config.paths.docsComponents ??
      path.posix.join(this.ctx.config.paths.docs, "components");
    const filePath = detail?.documentation ?? path.posix.join(docsDir, `${name}.md`);

    // Merge with existing analysis if available
    const variants =
      input.variants ??
      detail?.variants ??
      ["default"];
    const parameters =
      input.parameters ??
      detail?.parameters?.map((p) => ({
        name: p.name,
        type: "string",
        description: `Detected from Liquid (used ${p.usageCount}×)`,
      }));

    const content = buildDocsMarkdown({
      name,
      category: input.category ?? "general",
      overview: input.overview,
      variants,
      parameters,
      accessibility: input.accessibility,
      notes: input.notes,
    });

    if (input.dry_run) {
      return {
        success: true,
        operation: "docs_update",
        path: filePath,
        dry_run: true,
      };
    }

    const result = safeWriteFile(this.ctx.config.root, filePath, content, {
      maxSize: this.ctx.config.maxFileSize,
    });
    this.ctx.invalidateCache();
    logger.info("docs_update", { path: result.path, created: result.created });
    return {
      success: true,
      operation: "docs_update",
      path: result.path,
      created: result.created,
      modified: result.modified,
    };
  }

  get(name: string): { path: string; source: string } | null {
    const normalized = normalizeComponentName(name);
    const detail = this.components.get(normalized);
    if (detail?.documentation && detail.documentationSource) {
      return { path: detail.documentation, source: detail.documentationSource };
    }
    const docsDir =
      this.ctx.config.paths.docsComponents ??
      path.posix.join(this.ctx.config.paths.docs, "components");
    const filePath = path.posix.join(docsDir, `${normalized}.md`);
    if (safeExists(this.ctx.config.root, filePath)) {
      return {
        path: filePath,
        source: safeReadFile(this.ctx.config.root, filePath, {
          maxSize: this.ctx.config.maxFileSize,
        }),
      };
    }
    return null;
  }
}
