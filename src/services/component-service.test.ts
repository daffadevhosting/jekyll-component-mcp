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

function makeThicketProject(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jekyll-mcp-thicket-"));
  temporaryRoots.push(root);
  for (const directory of [
    "_includes/components",
    "assets/scss/components",
    "assets/js/components",
    "docs/components",
    "examples/components",
  ]) {
    fs.mkdirSync(path.join(root, directory), { recursive: true });
  }
  fs.writeFileSync(path.join(root, "assets/scss", "_tokens.scss"), ":root {}\n");
  fs.writeFileSync(path.join(root, "assets/scss", "_framework.scss"), '@use "tokens";\n');
  fs.writeFileSync(
    path.join(root, "assets/js", "main.js"),
    "import { initTheme } from './components/theme.js';\n\n" +
      "document.addEventListener('DOMContentLoaded', () => {\n  initTheme();\n});\n",
  );
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

function createDefaultService(root: string): ComponentService {
  return new ComponentService(createContext(resolveConfig({ root })));
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
        "SCSS should define a BEM selector beginning with .notice or .c-notice",
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

  it("uses Thicket BEM classes and registers SCSS in the framework entry point", () => {
    const root = makeThicketProject();
    const service = createDefaultService(root);

    const result = service.create({ name: "promo-card" });

    expect(result.success).toBe(true);
    const liquid = fs.readFileSync(
      path.join(root, "_includes", "components", "promo-card.html"),
      "utf8",
    );
    const scss = fs.readFileSync(
      path.join(root, "assets", "scss", "components", "_promo-card.scss"),
      "utf8",
    );
    const frameworkScss = fs.readFileSync(path.join(root, "assets", "scss", "_framework.scss"), "utf8");

    expect(liquid).toContain('class="c-promo-card c-promo-card--{{ variant');
    expect(scss).toContain(".c-promo-card {");
    expect(frameworkScss).toContain('@use "components/promo-card";');
    expect(result.files_modified).toContain("assets/scss/_framework.scss");
  });

  it("validates existing Thicket component classes without legacy-prefix warnings", () => {
    const root = makeThicketProject();
    fs.writeFileSync(
      path.join(root, "_includes", "components", "alert.html"),
      `{% assign variant = include.variant | default: "info" %}\n<div class="c-alert c-alert--{{ variant }}"></div>\n`,
    );
    fs.writeFileSync(
      path.join(root, "assets", "scss", "components", "_alert.scss"),
      ".c-alert { &--info { color: red; } }\n",
    );
    fs.writeFileSync(path.join(root, "docs", "components", "alert.md"), "# Alert\n");

    const service = createDefaultService(root);
    const validation = service.validate("alert");
    const preview = service.preview("alert", { variant: "info" });

    expect(validation.warnings).toEqual([]);
    expect(preview.html).toContain('class="c-alert c-alert--info"');
  });

  it("registers opt-in Thicket JavaScript modules in the main entry point", () => {
    const root = makeThicketProject();
    const service = createDefaultService(root);

    const result = service.create({
      name: "toast-alert",
      javascript: true,
      documentation: false,
      example: false,
    });

    const mainJs = fs.readFileSync(path.join(root, "assets", "js", "main.js"), "utf8");
    expect(result.success).toBe(true);
    expect(mainJs).toContain("import { initToastAlert } from './components/toast-alert.js';");
    expect(mainJs).toContain("  initToastAlert();");
    expect(result.files_modified).toContain("assets/js/main.js");
  });

  it("previews Thicket entry-point changes without modifying the project", () => {
    const root = makeThicketProject();
    const service = createDefaultService(root);

    const result = service.create({
      name: "toast-alert",
      javascript: true,
      dry_run: true,
    });

    expect(result.success).toBe(true);
    expect(result.operations).toEqual(
      expect.arrayContaining([
        { type: "update", path: "assets/scss/_framework.scss" },
        { type: "update", path: "assets/js/main.js" },
      ]),
    );
    expect(result.diffs?.find((entry) => entry.path === "assets/scss/_framework.scss")?.diff).toContain(
      '@use "components/toast-alert";',
    );
    expect(
      fs.readFileSync(path.join(root, "assets/scss", "_framework.scss"), "utf8"),
    ).not.toContain("components/toast-alert");
    expect(fs.readFileSync(path.join(root, "assets/js", "main.js"), "utf8")).not.toContain(
      "initToastAlert",
    );
  });

  it("updates only explicitly supplied existing component sources", () => {
    const root = makeProject();
    fs.writeFileSync(
      path.join(root, "_includes", "components", "notice.html"),
      '<div class="notice">Old</div>\n',
    );
    const service = createService(root);

    const preview = service.update({
      name: "notice",
      liquid: '<div class="notice">New</div>\n',
      dry_run: true,
    });
    expect(preview.operations).toEqual([{ type: "update", path: "_includes/components/notice.html" }]);
    expect(preview.diff).toContain("-<div class=\"notice\">Old</div>");
    expect(
      fs.readFileSync(path.join(root, "_includes", "components", "notice.html"), "utf8"),
    ).toContain("Old");

    const result = service.update({
      name: "notice",
      liquid: '<div class="notice">New</div>\n',
    });
    expect(result.success).toBe(true);
    expect(
      fs.readFileSync(path.join(root, "_includes", "components", "notice.html"), "utf8"),
    ).toContain("New");
  });

  it("duplicates component assets under a new name without modifying the source", () => {
    const root = makeProject();
    fs.writeFileSync(
      path.join(root, "_includes", "components", "notice.html"),
      '<div class="notice notice--info">{{ include.message }}</div>\n',
    );
    fs.writeFileSync(
      path.join(root, "_sass", "components", "_notice.scss"),
      ".notice { &--info { color: red; } }\n",
    );
    const service = createService(root);

    const result = service.duplicate({ name: "notice", new_name: "banner" });

    expect(result.success).toBe(true);
    expect(
      fs.readFileSync(path.join(root, "_includes", "components", "banner.html"), "utf8"),
    ).toContain("banner banner--info");
    expect(
      fs.readFileSync(path.join(root, "_includes", "components", "notice.html"), "utf8"),
    ).toContain("notice notice--info");
  });

  it("previews Sass and JavaScript registration when duplicating a Thicket component", () => {
    const root = makeThicketProject();
    fs.writeFileSync(
      path.join(root, "_includes", "components", "toast.html"),
      '<div class="c-toast"></div>\n',
    );
    fs.writeFileSync(
      path.join(root, "assets/scss/components", "_toast.scss"),
      ".c-toast {}\n",
    );
    fs.writeFileSync(
      path.join(root, "assets/js/components", "toast.js"),
      "export function initToast() {}\n",
    );
    const service = createDefaultService(root);

    const preview = service.duplicate({
      name: "toast",
      new_name: "notice",
      dry_run: true,
    });

    expect(preview.operations).toEqual(
      expect.arrayContaining([
        { type: "update", path: "assets/scss/_framework.scss" },
        { type: "update", path: "assets/js/main.js" },
      ]),
    );
    expect(preview.diffs?.find((entry) => entry.path === "assets/scss/_framework.scss")?.diff).toContain(
      '@use "components/notice";',
    );
    expect(
      fs.readFileSync(path.join(root, "assets/scss", "_framework.scss"), "utf8"),
    ).not.toContain("components/notice");
    expect(fs.readFileSync(path.join(root, "assets/js", "main.js"), "utf8")).not.toContain(
      "initNotice",
    );
  });

  it("renames files and matching references only after confirmed full-write", () => {
    const root = makeProject();
    fs.writeFileSync(
      path.join(root, "_includes", "components", "notice.html"),
      '<div class="notice notice--info">Hello</div>\n',
    );
    fs.writeFileSync(
      path.join(root, "_sass", "components", "_notice.scss"),
      ".notice { &--info { color: red; } }\n",
    );
    fs.writeFileSync(
      path.join(root, "_sass", "main.scss"),
      '@use "./components/notice";\n',
    );
    fs.writeFileSync(
      path.join(root, "page.html"),
      '{% include components/notice.html %}\n',
    );
    fs.mkdirSync(path.join(root, "_layouts"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "_layouts", "default.html"),
      '{% include components/notice.html %}\n',
    );
    const config = resolveConfig({ root });
    config.paths.scss = "_sass";
    config.paths.scssComponents = "_sass/components";
    config.paths.docs = "_docs";
    config.paths.docsComponents = "_docs/components";
    config.writeMode = "full-write";
    const service = new ComponentService(createContext(config));

    const preview = service.rename({
      name: "notice",
      new_name: "banner",
      dry_run: true,
    });
    expect(preview.operations).toEqual(
      expect.arrayContaining([
        { type: "create", path: "_includes/components/banner.html" },
        { type: "delete", path: "_includes/components/notice.html" },
        { type: "update", path: "page.html" },
        { type: "update", path: "_layouts/default.html" },
      ]),
    );
    expect(preview.diffs?.find((entry) => entry.path === "_layouts/default.html")?.diff).toContain(
      "components/banner.html",
    );
    expect(fs.existsSync(path.join(root, "_includes", "components", "notice.html"))).toBe(true);

    const result = service.rename({ name: "notice", new_name: "banner", confirm: true });
    expect(result.success).toBe(true);
    expect(fs.existsSync(path.join(root, "_includes", "components", "notice.html"))).toBe(false);
    expect(
      fs.readFileSync(path.join(root, "_includes", "components", "banner.html"), "utf8"),
    ).toContain("banner banner--info");
    expect(fs.readFileSync(path.join(root, "page.html"), "utf8")).toContain("components/banner.html");
    expect(
      fs.readFileSync(path.join(root, "_layouts", "default.html"), "utf8"),
    ).toContain("components/banner.html");
  });

  it("reports component dependencies in both directions and exports source files", () => {
    const root = makeProject();
    fs.writeFileSync(
      path.join(root, "_includes", "components", "notice.html"),
      '{% include components/icon.html %}\n<div class="notice"></div>\n',
    );
    fs.writeFileSync(
      path.join(root, "_includes", "components", "icon.html"),
      '<span class="icon"></span>\n',
    );
    fs.writeFileSync(
      path.join(root, "_includes", "components", "banner.html"),
      '{% include components/notice.html %}\n',
    );
    const service = createService(root);

    expect(service.dependencies("notice")).toEqual({
      component: "notice",
      dependencies: [{ name: "icon", files: ["_includes/components/notice.html"] }],
      dependents: [{ name: "banner", files: ["_includes/components/banner.html"] }],
    });
    const exported = service.export("notice");
    expect(exported.success).toBe(true);
    expect(exported.files).toContainEqual({
      path: "_includes/components/notice.html",
      content: '{% include components/icon.html %}\n<div class="notice"></div>\n',
    });
  });

  it("runs component checks without a project build when requested", async () => {
    const root = makeProject();
    fs.writeFileSync(
      path.join(root, "_includes", "components", "notice.html"),
      '<div class="notice"></div>\n',
    );
    const service = createService(root);

    const result = await service.test("notice", false);

    expect(result.success).toBe(true);
    expect(result.validation.component).toBe("notice");
    expect(result.build).toBeUndefined();
  });

  it("previews component deletion together with its Sass import cleanup", () => {
    const root = makeProject();
    fs.writeFileSync(
      path.join(root, "_includes", "components", "notice.html"),
      '<div class="notice"></div>\n',
    );
    fs.writeFileSync(
      path.join(root, "_sass", "components", "_notice.scss"),
      ".notice {}\n",
    );
    fs.writeFileSync(path.join(root, "_sass", "main.scss"), '@use "./components/notice";\n');
    const service = createService(root);

    const blocked = service.delete("notice", true);
    expect(blocked.success).toBe(false);
    expect(blocked.error?.code).toBe("WRITE_MODE_DENIED");
    expect(fs.existsSync(path.join(root, "_includes", "components", "notice.html"))).toBe(true);

    const result = service.delete("notice", false, true);

    expect(result.success).toBe(true);
    expect(result.operations).toEqual(
      expect.arrayContaining([
        { type: "delete", path: "_includes/components/notice.html" },
        { type: "delete", path: "_sass/components/_notice.scss" },
        { type: "update", path: "_sass/main.scss" },
      ]),
    );
    expect(result.diffs?.find((entry) => entry.path === "_includes/components/notice.html")?.diff)
      .toContain("-<div class=\"notice\"></div>");
    expect(fs.existsSync(path.join(root, "_sass", "components", "_notice.scss"))).toBe(true);
  });
});
