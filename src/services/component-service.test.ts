import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveConfig } from "../config/environment.js";
import { createContext } from "../server/context.js";
import { ComponentService } from "./component-service.js";

const temporaryRoots: string[] = [];

function makeProject(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jekyll-mcp-components-"));
  temporaryRoots.push(root);
  fs.mkdirSync(path.join(root, "_includes", "components"), { recursive: true });
  fs.mkdirSync(path.join(root, "_sass", "components"), { recursive: true });
  return root;
}

function createService(root: string): ComponentService {
  const config = resolveConfig({ root });
  config.paths.scss = "_sass";
  config.paths.scssComponents = "_sass/components";
  config.paths.docs = "_docs";
  config.paths.docsComponents = "_docs/components";
  return new ComponentService(createContext(config));
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("component inspection and validation", () => {
  it("reports Liquid parameter defaults and guards", () => {
    const root = makeProject();
    fs.writeFileSync(
      path.join(root, "_includes", "components", "navbar.html"),
      `{% assign label = include.label | default: "Home" %}\n{% if include.id %}{{ include.id }}{% endif %}\n{{ label }}\n`,
    );
    fs.writeFileSync(
      path.join(root, "_sass", "components", "_navbar.scss"),
      ".navbar { &__label { display: block; } }\n",
    );
    fs.mkdirSync(path.join(root, "_docs", "components"), { recursive: true });
    fs.writeFileSync(path.join(root, "_docs", "components", "navbar.md"), "# Navbar\n");

    const service = createService(root);
    const detail = service.get("navbar");
    expect(detail?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "label", hasDefault: true, hasGuard: false }),
        expect.objectContaining({ name: "id", hasDefault: false, hasGuard: true }),
      ]),
    );
    expect(service.validate("navbar").warnings).toEqual([]);
  });

  it("warns when parameters lack guards/defaults or SCSS is not BEM-named", () => {
    const root = makeProject();
    fs.writeFileSync(
      path.join(root, "_includes", "components", "notice.html"),
      "{{ include.message }}\n",
    );
    fs.writeFileSync(
      path.join(root, "_sass", "components", "_notice.scss"),
      ".unrelated { color: red; }\n",
    );

    const service = createService(root);
    const result = service.validate("notice");
    expect(result.valid).toBe(true);
    expect(result.warnings.map((warning) => warning.message)).toEqual(
      expect.arrayContaining([
        "include.message has no default fallback or if/unless guard",
        "SCSS should define a BEM selector beginning with .notice",
      ]),
    );
  });

  it("generates documented Liquid/SCSS boilerplate and registers the SCSS import", () => {
    const root = makeProject();
    fs.writeFileSync(path.join(root, "_sass", "main.scss"), "@use \"tokens/colors\";\n");

    const service = createService(root);
    const result = service.create({ name: "testimonial", dry_run: false });

    expect(result.success).toBe(true);
    const liquid = fs.readFileSync(
      path.join(root, "_includes", "components", "testimonial.html"),
      "utf8",
    );
    expect(liquid).toContain("Parameters:");
    expect(liquid).toContain('include.label | default: ""');
    expect(liquid).toContain("include.content | default: \"\"");
    expect(fs.readFileSync(path.join(root, "_sass", "main.scss"), "utf8")).toContain(
      '@use "./components/testimonial";',
    );
  });

  it("builds a component catalog with derived status, tags, and summary", () => {
    const root = makeProject();
    fs.writeFileSync(
      path.join(root, "_includes", "components", "nav-item.html"),
      `{% assign label = include.label | default: "Menu" %}\n<div class="nav-item nav-item--primary">{{ label }}</div>\n`,
    );
    fs.writeFileSync(
      path.join(root, "_sass", "components", "_nav-item.scss"),
      ".nav-item { &--primary { color: red; } }\n",
    );
    fs.mkdirSync(path.join(root, "_docs", "components"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "_docs", "components", "nav-item.md"),
      "---\ntitle: Nav Item\n---\n\n## Overview\n\nNavigation item component.\n",
    );

    const service = createService(root);
    const catalog = service.getCatalog();

    expect(catalog).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "nav-item",
          status: "stable",
          summary: expect.stringContaining("Navigation item"),
          tags: expect.arrayContaining(["scss", "documented", "varianted"]),
        }),
      ]),
    );
  });

  it("returns a diff preview for dry-run component creation", () => {
    const root = makeProject();
    fs.writeFileSync(path.join(root, "_sass", "main.scss"), "@use \"tokens/colors\";\n");

    const service = createService(root);
    const result = service.create({ name: "hero", dry_run: true });

    expect(result.success).toBe(true);
    expect(result.dry_run).toBe(true);
    expect(result.diff ?? result.diffs?.[0]?.diff ?? "").toContain("--- _includes/components/hero.html");
    expect(result.diff ?? result.diffs?.[0]?.diff ?? "").toContain(
      '+<div class="hero hero--{{ variant | escape }} {{ extra_class | escape }}"',
    );
  });

  it("rejects invalid component schema before creating files", () => {
    const root = makeProject();
    const service = createService(root);

    const result = service.create({
      name: "promo-card",
      variants: ["Primary!", "primary", "default"],
      dry_run: false,
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("VALIDATION_ERROR");
    expect(result.error?.message).toContain("variant");
  });

  it("renders a preview HTML sample for a component", () => {
    const root = makeProject();
    fs.writeFileSync(
      path.join(root, "_includes", "components", "alert.html"),
      `{% assign label = include.label | default: "System" %}\n{% assign variant = include.variant | default: "default" %}\n<div class="alert alert--{{ variant }}">{{ label }}</div>\n`,
    );
    fs.writeFileSync(
      path.join(root, "_sass", "components", "_alert.scss"),
      ".alert { &--success { color: green; } }\n",
    );

    const service = createService(root);
    const result = service.preview("alert", {
      variant: "success",
      params: { label: "System update" },
    });

    expect(result.success).toBe(true);
    expect(result.html).toContain('class="alert alert--success"');
    expect(result.html).toContain("System update");
  });

  it("stores category metadata in generated docs and catalog entries", () => {
    const root = makeProject();
    const service = createService(root);

    const result = service.create({
      name: "cta-banner",
      category: "marketing",
      variants: ["default", "primary"],
      dry_run: false,
    });

    expect(result.success).toBe(true);
    const docs = fs.readFileSync(path.join(root, "_docs", "components", "cta-banner.md"), "utf8");
    expect(docs).toContain("category: marketing");
    expect(service.getCatalog()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "cta-banner",
          category: "marketing",
          tags: expect.arrayContaining(["marketing"]),
        }),
      ]),
    );
  });
});
