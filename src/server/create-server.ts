/**
 * MCP server factory: registers tools, resources, and prompts.
 * Business logic lives in services; this layer only wires the protocol.
 */

import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { PACKAGE_NAME, PACKAGE_VERSION } from "../config/constants.js";
import type { ServerContext } from "./context.js";
import { ProjectService } from "../services/project-service.js";
import { ComponentService } from "../services/component-service.js";
import { BuildService } from "../services/build-service.js";
import { ScssService } from "../services/scss-service.js";
import { TokenService } from "../services/token-service.js";
import { LiquidService } from "../services/liquid-service.js";
import { DocumentationService } from "../services/documentation-service.js";
import { ValidationService } from "../services/validation-service.js";
import { logger } from "../utils/logger.js";
import { safeJsonStringify } from "../utils/json.js";

function textResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: safeJsonStringify(data, true) }],
  };
}

function errorResult(code: string, message: string, details?: unknown) {
  return textResult({
    success: false,
    error: { code, message, details },
  });
}

export function createServer(ctx: ServerContext): McpServer {
  const server = new McpServer({
    name: PACKAGE_NAME,
    version: PACKAGE_VERSION,
  });

  const projectService = new ProjectService(ctx);
  const componentService = new ComponentService(ctx);
  const buildService = new BuildService(ctx);
  const scssService = new ScssService(ctx);
  const tokenService = new TokenService(ctx);
  const liquidService = new LiquidService(ctx);
  const docsService = new DocumentationService(ctx);
  const validationService = new ValidationService(ctx);

  // ─── Project tools ───────────────────────────────────────────────────────

  server.registerTool(
    "jekyll_project_info",
    {
      description:
        "Return a high-level summary of the Jekyll project: whether it is a Jekyll site, counts of layouts/includes/components, presence of SCSS/JS/docs, and current write mode. Use this first to orient yourself. Does not modify any files. Never exposes secrets.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        return textResult(projectService.getInfo());
      } catch (err) {
        return errorResult("PROJECT_INFO_FAILED", (err as Error).message);
      }
    },
  );

  server.registerTool(
    "jekyll_project_scan",
    {
      description:
        "Scan the project and return a structured architecture map: config files, key directories, layouts, includes, components (with liquid/scss/js/docs paths), sections, SCSS and JS files. Use when you need a detailed map before creating or modifying components. Read-only.",
      inputSchema: z.object({
        force: z
          .boolean()
          .optional()
          .describe("If true, bypass cache and rescan the filesystem"),
      }),
    },
    async ({ force }) => {
      try {
        return textResult(projectService.getScan(force === true));
      } catch (err) {
        return errorResult("PROJECT_SCAN_FAILED", (err as Error).message);
      }
    },
  );

  server.registerTool(
    "jekyll_config_get",
    {
      description:
        "Read Jekyll configuration (_config.yml etc.) with sensitive keys redacted. Use to understand site settings. Never returns API keys, tokens, or credentials. Read-only.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        return textResult(projectService.getConfig());
      } catch (err) {
        return errorResult("CONFIG_GET_FAILED", (err as Error).message);
      }
    },
  );

  // ─── Component tools ─────────────────────────────────────────────────────

  server.registerTool(
    "jekyll_component_list",
    {
      description:
        "List all detected reusable components with paths to Liquid, SCSS, JavaScript, documentation, and examples. Use to discover existing components before creating new ones. Read-only.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        return textResult({ components: componentService.list() });
      } catch (err) {
        return errorResult("COMPONENT_LIST_FAILED", (err as Error).message);
      }
    },
  );

  server.registerTool(
    "jekyll_component_get",
    {
      description:
        "Get full details for one component by name: Liquid/SCSS/JS/docs source, detected parameters (include.*), variants, accessibility notes, and class names. Use before editing or reviewing a component. Read-only.",
      inputSchema: z.object({
        name: z.string().describe("Component name (any case/spacing; normalized to kebab-case)"),
      }),
    },
    async ({ name }) => {
      try {
        const detail = componentService.get(name);
        if (!detail) {
          return errorResult("NOT_FOUND", `Component not found: ${name}`);
        }
        return textResult(detail);
      } catch (err) {
        return errorResult("COMPONENT_GET_FAILED", (err as Error).message);
      }
    },
  );

  server.registerTool(
    "jekyll_component_catalog",
    {
      description:
        "Return a catalog view of all discovered components with status, tags, summary, path coverage, variants, and parameter counts. Ideal for quick project/component library reviews.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        return textResult({ components: componentService.getCatalog() });
      } catch (err) {
        return errorResult("COMPONENT_CATALOG_FAILED", (err as Error).message);
      }
    },
  );

  server.registerTool(
    "jekyll_component_create",
    {
      description:
        "Create a reusable Jekyll Liquid component and its associated SCSS, documentation, and example files. Use when the user asks to create a new reusable UI component. Do not use for one-off page markup. This operation modifies project files. Supports dry_run. Names are normalized to kebab-case.",
      inputSchema: z.object({
        name: z.string().describe("Component name (e.g. 'Pricing Card' or 'pricing-card')"),
        category: z.string().optional().describe("Optional category label"),
        variants: z
          .array(z.string())
          .optional()
          .describe("Variant names, e.g. ['default','popular']"),
        javascript: z.boolean().optional().describe("Also create a JS module (default false)"),
        documentation: z.boolean().optional().describe("Create docs file (default true)"),
        example: z.boolean().optional().describe("Create example file (default true)"),
        dry_run: z
          .boolean()
          .optional()
          .describe("If true, only report planned operations without writing files"),
      }),
    },
    async (input) => {
      try {
        logger.info("component_create", { name: input.name, dry_run: input.dry_run });
        const result = componentService.create(input);
        return textResult(result);
      } catch (err) {
        return errorResult("COMPONENT_CREATE_FAILED", (err as Error).message);
      }
    },
  );

  server.registerTool(
    "jekyll_component_preview",
    {
      description:
        "Generate a lightweight HTML preview for a component using a sample payload and selected variant. Useful for reviewing a component before committing it to a page.",
      inputSchema: z.object({
        name: z.string().describe("Component name"),
        variant: z.string().optional().describe("Variant to preview, e.g. default or success"),
        params: z
          .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
          .optional()
          .describe("Sample parameters such as label, content, class, id"),
      }),
    },
    async ({ name, variant, params }) => {
      try {
        return textResult(
          componentService.preview(name, {
            variant,
            params: params as Record<string, string | number | boolean | null | undefined> | undefined,
          }),
        );
      } catch (err) {
        return errorResult("COMPONENT_PREVIEW_FAILED", (err as Error).message);
      }
    },
  );

  server.registerTool(
    "jekyll_component_validate",
    {
      description:
        "Validate a component: file existence, Liquid syntax patterns, SCSS presence, documentation, accessibility hints, and parameter consistency. Returns structured errors and warnings. Read-only.",
      inputSchema: z.object({
        name: z.string().describe("Component name"),
      }),
    },
    async ({ name }) => {
      try {
        return textResult(componentService.validate(name));
      } catch (err) {
        return errorResult("COMPONENT_VALIDATE_FAILED", (err as Error).message);
      }
    },
  );

  server.registerTool(
    "list_components",
    {
      description:
        "List reusable Jekyll components and their Liquid, SCSS, JavaScript, documentation, and example paths. Read-only alias for jekyll_component_list.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        return textResult({ components: componentService.list() });
      } catch (err) {
        return errorResult("COMPONENT_LIST_FAILED", (err as Error).message);
      }
    },
  );

  server.registerTool(
    "inspect_component",
    {
      description:
        "Inspect a component's Liquid/SCSS sources, include parameters and fallbacks, variants, and dependencies. Read-only alias for jekyll_component_get.",
      inputSchema: z.object({
        name: z.string().describe("Component name"),
      }),
    },
    async ({ name }) => {
      try {
        const detail = componentService.get(name);
        if (!detail) return errorResult("NOT_FOUND", `Component not found: ${name}`);
        return textResult(detail);
      } catch (err) {
        return errorResult("COMPONENT_GET_FAILED", (err as Error).message);
      }
    },
  );

  server.registerTool(
    "component_catalog",
    {
      description:
        "Return a catalog overview of all components with status, tags, summary, path coverage, parameter counts, and variants. Read-only alias for jekyll_component_catalog.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        return textResult({ components: componentService.getCatalog() });
      } catch (err) {
        return errorResult("COMPONENT_CATALOG_FAILED", (err as Error).message);
      }
    },
  );

  server.registerTool(
    "create_component",
    {
      description:
        "Generate a Liquid component, BEM SCSS, and optional docs/example/JavaScript files. Supports dry_run. Alias for jekyll_component_create.",
      inputSchema: z.object({
        name: z.string().describe("Component name, normalized to kebab-case"),
        category: z.string().optional().describe("Optional category label"),
        variants: z.array(z.string()).optional().describe("Variant names"),
        javascript: z.boolean().optional().describe("Also create a JS module"),
        documentation: z.boolean().optional().describe("Create docs (default true)"),
        example: z.boolean().optional().describe("Create an example (default true)"),
        dry_run: z.boolean().optional().describe("Preview operations without writing files"),
      }),
    },
    async (input) => {
      try {
        logger.info("component_create", { name: input.name, dry_run: input.dry_run });
        return textResult(componentService.create(input));
      } catch (err) {
        return errorResult("COMPONENT_CREATE_FAILED", (err as Error).message);
      }
    },
  );

  server.registerTool(
    "validate_component",
    {
      description:
        "Check component Liquid syntax, include parameter fallbacks/guards, and BEM/SCSS naming. Read-only alias for jekyll_component_validate.",
      inputSchema: z.object({
        name: z.string().describe("Component name"),
      }),
    },
    async ({ name }) => {
      try {
        return textResult(componentService.validate(name));
      } catch (err) {
        return errorResult("COMPONENT_VALIDATE_FAILED", (err as Error).message);
      }
    },
  );

  server.registerTool(
    "preview_component",
    {
      description:
        "Generate a lightweight HTML preview for a component using sample params and variant names. Alias for jekyll_component_preview.",
      inputSchema: z.object({
        name: z.string().describe("Component name"),
        variant: z.string().optional().describe("Variant to preview"),
        params: z
          .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
          .optional()
          .describe("Preview arguments like label, content, class, id"),
      }),
    },
    async ({ name, variant, params }) => {
      try {
        return textResult(
          componentService.preview(name, {
            variant,
            params: params as Record<string, string | number | boolean | null | undefined> | undefined,
          }),
        );
      } catch (err) {
        return errorResult("COMPONENT_PREVIEW_FAILED", (err as Error).message);
      }
    },
  );

  server.registerTool(
    "jekyll_component_delete",
    {
      description:
        "Delete a component and its associated files (Liquid, SCSS, JS, docs, example). DESTRUCTIVE. Requires confirm: true and full-write mode. Prefer dry reasoning before calling.",
      inputSchema: z.object({
        name: z.string(),
        confirm: z.boolean().describe("Must be true to proceed"),
      }),
    },
    async ({ name, confirm }) => {
      try {
        return textResult(componentService.delete(name, confirm));
      } catch (err) {
        return errorResult("COMPONENT_DELETE_FAILED", (err as Error).message);
      }
    },
  );

  // ─── SCSS tools ──────────────────────────────────────────────────────────

  server.registerTool(
    "jekyll_scss_list",
    {
      description:
        "List SCSS/CSS files under the project SCSS root and detect architecture layers (tokens, mixins, base, utilities, components, sections). Use to understand stylesheet structure before editing. Read-only.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        return textResult(scssService.list());
      } catch (err) {
        return errorResult("SCSS_LIST_FAILED", (err as Error).message);
      }
    },
  );

  server.registerTool(
    "jekyll_scss_get",
    {
      description:
        "Read an SCSS file and return its source plus analysis (imports, variables, CSS custom properties, mixins, selectors). Provide a path relative to the project root (from jekyll_scss_list). Read-only.",
      inputSchema: z.object({
        path: z.string().describe("Relative path to the SCSS file"),
      }),
    },
    async ({ path: filePath }) => {
      try {
        return textResult(scssService.get(filePath));
      } catch (err) {
        return errorResult("SCSS_GET_FAILED", (err as Error).message);
      }
    },
  );

  server.registerTool(
    "jekyll_scss_create",
    {
      description:
        "Create a new SCSS partial (e.g. component or utility). Writes under the configured SCSS tree. Modifies project files. Supports dry_run.",
      inputSchema: z.object({
        name: z.string().describe("Partial name without leading underscore or extension"),
        category: z
          .enum(["component", "section", "utility", "token"])
          .optional()
          .describe("Target folder category (default component)"),
        content: z.string().optional().describe("Optional SCSS body; a stub is generated if omitted"),
        dry_run: z.boolean().optional(),
      }),
    },
    async (input) => {
      try {
        return textResult(scssService.create(input));
      } catch (err) {
        return errorResult("SCSS_CREATE_FAILED", (err as Error).message);
      }
    },
  );

  // ─── Design token tools ──────────────────────────────────────────────────

  server.registerTool(
    "jekyll_token_list",
    {
      description:
        "List design tokens discovered in SCSS (CSS custom properties and Sass variables), categorized by color, spacing, radius, shadow, typography, breakpoints, motion, etc. Read-only.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        return textResult(tokenService.list());
      } catch (err) {
        return errorResult("TOKEN_LIST_FAILED", (err as Error).message);
      }
    },
  );

  server.registerTool(
    "jekyll_token_get",
    {
      description:
        "Get tokens matching a name or category (e.g. 'color', 'spacing', '--color-primary'). Read-only.",
      inputSchema: z.object({
        name: z.string().describe("Token name fragment or category"),
      }),
    },
    async ({ name }) => {
      try {
        return textResult({ tokens: tokenService.get(name) });
      } catch (err) {
        return errorResult("TOKEN_GET_FAILED", (err as Error).message);
      }
    },
  );

  server.registerTool(
    "jekyll_token_update",
    {
      description:
        "Update or append a design token declaration in an SCSS/CSS file. Prefer CSS custom properties. Modifies project files. Supports dry_run.",
      inputSchema: z.object({
        file: z.string().describe("Relative path to the tokens SCSS/CSS file"),
        name: z.string().describe("Token name (with or without -- or $ prefix)"),
        value: z.string().describe("New value, e.g. '#0ea5e9' or '1rem'"),
        dry_run: z.boolean().optional(),
      }),
    },
    async (input) => {
      try {
        return textResult(tokenService.update(input));
      } catch (err) {
        return errorResult("TOKEN_UPDATE_FAILED", (err as Error).message);
      }
    },
  );

  // ─── Liquid tools ────────────────────────────────────────────────────────

  server.registerTool(
    "jekyll_include_list",
    {
      description:
        "List Liquid includes under _includes (excluding the components/ and sections/ subtrees, which have dedicated tools). Read-only. Never executes Liquid.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        return textResult({ includes: liquidService.listIncludes() });
      } catch (err) {
        return errorResult("INCLUDE_LIST_FAILED", (err as Error).message);
      }
    },
  );

  server.registerTool(
    "jekyll_include_get",
    {
      description:
        "Read a Liquid include by name or relative path. Returns source, front matter, parameter analysis, and basic syntax checks. Read-only. Never executes Liquid.",
      inputSchema: z.object({
        name: z.string().describe("Include name or relative path"),
      }),
    },
    async ({ name }) => {
      try {
        const detail = liquidService.getInclude(name);
        if (!detail) return errorResult("NOT_FOUND", `Include not found: ${name}`);
        return textResult(detail);
      } catch (err) {
        return errorResult("INCLUDE_GET_FAILED", (err as Error).message);
      }
    },
  );

  server.registerTool(
    "jekyll_layout_list",
    {
      description:
        "List Liquid layouts under _layouts. Read-only. Never executes Liquid.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        return textResult({ layouts: liquidService.listLayouts() });
      } catch (err) {
        return errorResult("LAYOUT_LIST_FAILED", (err as Error).message);
      }
    },
  );

  server.registerTool(
    "jekyll_layout_get",
    {
      description:
        "Read a Liquid layout by name or relative path. Returns source, front matter, and analysis. Read-only. Never executes Liquid.",
      inputSchema: z.object({
        name: z.string().describe("Layout name or relative path"),
      }),
    },
    async ({ name }) => {
      try {
        const detail = liquidService.getLayout(name);
        if (!detail) return errorResult("NOT_FOUND", `Layout not found: ${name}`);
        return textResult(detail);
      } catch (err) {
        return errorResult("LAYOUT_GET_FAILED", (err as Error).message);
      }
    },
  );

  // ─── Documentation tools ─────────────────────────────────────────────────

  server.registerTool(
    "jekyll_docs_create",
    {
      description:
        "Create component documentation (Overview, Usage, Parameters, Variants, Example, Accessibility, Notes). Modifies project files. Supports dry_run.",
      inputSchema: z.object({
        name: z.string().describe("Component name"),
        overview: z.string().optional(),
        variants: z.array(z.string()).optional(),
        parameters: z
          .array(
            z.object({
              name: z.string(),
              type: z.string().optional(),
              default: z.string().optional(),
              description: z.string().optional(),
            }),
          )
          .optional(),
        dry_run: z.boolean().optional(),
      }),
    },
    async (input) => {
      try {
        return textResult(docsService.create(input));
      } catch (err) {
        return errorResult("DOCS_CREATE_FAILED", (err as Error).message);
      }
    },
  );

  server.registerTool(
    "jekyll_docs_update",
    {
      description:
        "Update or regenerate documentation for a component. Fills gaps from detected Liquid parameters when possible. Modifies project files. Supports dry_run.",
      inputSchema: z.object({
        name: z.string(),
        overview: z.string().optional(),
        variants: z.array(z.string()).optional(),
        parameters: z
          .array(
            z.object({
              name: z.string(),
              type: z.string().optional(),
              default: z.string().optional(),
              description: z.string().optional(),
            }),
          )
          .optional(),
        accessibility: z.string().optional(),
        notes: z.string().optional(),
        dry_run: z.boolean().optional(),
      }),
    },
    async (input) => {
      try {
        return textResult(docsService.update(input));
      } catch (err) {
        return errorResult("DOCS_UPDATE_FAILED", (err as Error).message);
      }
    },
  );

  // ─── Validation & build ──────────────────────────────────────────────────

  server.registerTool(
    "jekyll_validate",
    {
      description:
        "Run safe project-level validation: component structure, Liquid patterns, front matter, optional Jekyll build. Returns structured errors and warnings. Does not execute arbitrary shell.",
      inputSchema: z.object({
        run_build: z
          .boolean()
          .optional()
          .describe("If true, also run jekyll build (slower)"),
      }),
    },
    async ({ run_build }) => {
      try {
        const result = await validationService.validate({ runBuild: run_build === true });
        return textResult(result);
      } catch (err) {
        return errorResult("VALIDATE_FAILED", (err as Error).message);
      }
    },
  );

  server.registerTool(
    "jekyll_build",
    {
      description:
        "Run a Jekyll build (bundle exec jekyll build when Gemfile present). Captures exit code, stdout, stderr, duration, and _site path. Does not accept arbitrary shell commands. Use after creating or modifying components to verify the site builds. May take up to the configured timeout (default 120s).",
      inputSchema: z.object({
        clean: z.boolean().optional().describe("Run jekyll clean before build"),
      }),
    },
    async ({ clean }) => {
      try {
        const result = await buildService.build({ clean });
        return textResult(result);
      } catch (err) {
        return errorResult("BUILD_FAILED", (err as Error).message);
      }
    },
  );

  server.registerTool(
    "jekyll_doctor",
    {
      description:
        "Run jekyll doctor to check for common configuration and environment issues. Read-only regarding project source files.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const result = await buildService.doctor();
        return textResult(result);
      } catch (err) {
        return errorResult("DOCTOR_FAILED", (err as Error).message);
      }
    },
  );

  // ─── Resources ───────────────────────────────────────────────────────────

  server.registerResource(
    "jekyll-project",
    "jekyll://project",
    {
      description: "High-level Jekyll project summary",
      mimeType: "application/json",
    },
    async () => ({
      contents: [
        {
          uri: "jekyll://project",
          mimeType: "application/json",
          text: safeJsonStringify(projectService.getInfo(), true),
        },
      ],
    }),
  );

  server.registerResource(
    "jekyll-components",
    "jekyll://components",
    {
      description: "List of all detected components",
      mimeType: "application/json",
    },
    async () => ({
      contents: [
        {
          uri: "jekyll://components",
          mimeType: "application/json",
          text: safeJsonStringify({ components: componentService.list() }, true),
        },
      ],
    }),
  );

  server.registerResource(
    "jekyll-tokens",
    "jekyll://tokens",
    {
      description: "Design tokens discovered in SCSS",
      mimeType: "application/json",
    },
    async () => ({
      contents: [
        {
          uri: "jekyll://tokens",
          mimeType: "application/json",
          text: safeJsonStringify(tokenService.list(), true),
        },
      ],
    }),
  );

  server.registerResource(
    "jekyll-config",
    "jekyll://config",
    {
      description: "Sanitized Jekyll configuration",
      mimeType: "application/json",
    },
    async () => ({
      contents: [
        {
          uri: "jekyll://config",
          mimeType: "application/json",
          text: safeJsonStringify(projectService.getConfig(), true),
        },
      ],
    }),
  );

  server.registerResource(
    "jekyll-documentation",
    "jekyll://documentation",
    {
      description: "Documentation file index under docs/",
      mimeType: "application/json",
    },
    async () => {
      const scan = projectService.getScan();
      return {
        contents: [
          {
            uri: "jekyll://documentation",
            mimeType: "application/json",
            text: safeJsonStringify({ files: scan.docsFiles }, true),
          },
        ],
      };
    },
  );

  // ─── Prompts ─────────────────────────────────────────────────────────────

  server.registerPrompt(
    "jekyll_component_review",
    {
      description:
        "Review a Jekyll component for Liquid quality, SCSS architecture, JS necessity, accessibility, API consistency, and responsive behavior.",
      argsSchema: z.object({
        name: z.string().describe("Component name to review"),
      }),
    },
    async ({ name }) => {
      const detail = componentService.get(name);
      const body = detail
        ? safeJsonStringify(detail, true)
        : `Component "${name}" not found.`;
      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: `Review the following Jekyll component for production quality.\n\nFocus on:\n- Liquid structure and parameter API\n- SCSS organization and variants\n- JavaScript necessity and size\n- Accessibility (semantic HTML, keyboard, ARIA, focus)\n- Responsive behavior\n- Consistency with the rest of the component library\n\nComponent data:\n\`\`\`json\n${body}\n\`\`\`\n\nProvide actionable recommendations.`,
            },
          },
        ],
      };
    },
  );

  server.registerPrompt(
    "jekyll_accessibility_review",
    {
      description:
        "Accessibility-focused review: semantic HTML, keyboard navigation, focus, ARIA, labels, reduced motion, contrast considerations.",
      argsSchema: z.object({
        name: z.string().describe("Component name"),
      }),
    },
    async ({ name }) => {
      const detail = componentService.get(name);
      const source = detail?.liquidSource ?? "(no liquid source)";
      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: `Perform an accessibility review of this Jekyll Liquid component.\n\nCheck:\n- Semantic HTML elements\n- Keyboard navigation and focus visibility\n- ARIA roles/properties only when needed\n- Form labels and accessible names\n- prefers-reduced-motion considerations\n- Color contrast (flag if hard-coded low-contrast values appear)\n\nLiquid source:\n\`\`\`liquid\n${source}\n\`\`\`\n\nReturn a prioritized list of issues and fixes.`,
            },
          },
        ],
      };
    },
  );

  server.registerPrompt(
    "jekyll_performance_review",
    {
      description:
        "Performance review: CSS/JS size, external dependencies, images, render-blocking resources, unnecessary JavaScript.",
      argsSchema: z.object({
        name: z.string().optional().describe("Optional component name; omit for project-level"),
      }),
    },
    async ({ name }) => {
      const info = projectService.getInfo();
      const scan = projectService.getScan();
      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: `Review performance characteristics of this Jekyll project${name ? ` (focus component: ${name})` : ""}.\n\nProject info:\n\`\`\`json\n${safeJsonStringify(info, true)}\n\`\`\`\n\nSCSS file count: ${scan.scssFiles.length}\nJS file count: ${scan.jsFiles.length}\nComponents: ${scan.components.length}\n\nAssess CSS/JS payload risk, render-blocking assets, and opportunities to reduce JavaScript.`,
            },
          },
        ],
      };
    },
  );

  server.registerPrompt(
    "jekyll_production_review",
    {
      description:
        "Complete production-readiness review covering structure, components, accessibility, performance, and build health.",
      argsSchema: z.object({}),
    },
    async () => {
      const info = projectService.getInfo();
      const scan = projectService.getScan();
      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: `Perform a full production-readiness review of this Jekyll component project.\n\nInfo:\n\`\`\`json\n${safeJsonStringify(info, true)}\n\`\`\`\n\nComponents:\n\`\`\`json\n${safeJsonStringify(scan.components, true)}\n\`\`\`\n\nCover: project structure, component API consistency, documentation coverage, accessibility, performance, and build/configuration risks. Prioritize findings.`,
            },
          },
        ],
      };
    },
  );

  return server;
}
