import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createInitConfig,
  detectThemePreset,
  initializeProject,
} from "./init.js";

const temporaryRoots: string[] = [];

function makeProject(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jekyll-mcp-init-"));
  temporaryRoots.push(root);
  return root;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("Jekyll theme preset detection", () => {
  it("detects Chirpy from the Jekyll theme setting", () => {
    const root = makeProject();
    fs.writeFileSync(path.join(root, "_config.yml"), "theme: jekyll-theme-chirpy\n");
    expect(detectThemePreset(root)).toBe("chirpy");
  });

  it("detects Minimal Mistakes from remote_theme", () => {
    const root = makeProject();
    fs.writeFileSync(path.join(root, "_config.yml"), "remote_theme: mmistakes/minimal-mistakes\n");
    expect(detectThemePreset(root)).toBe("minimal-mistakes");
  });

  it("uses the standard preset for ordinary Jekyll projects", () => {
    const root = makeProject();
    fs.mkdirSync(path.join(root, "_includes"));
    expect(detectThemePreset(root)).toBe("standard");
  });
});

describe("project initialization", () => {
  it("uses an existing sass_dir and theme-specific component paths", () => {
    const root = makeProject();
    fs.writeFileSync(path.join(root, "_config.yml"), "sass:\n  sass_dir: _sass\n");
    fs.mkdirSync(path.join(root, "_sass", "jekyll-theme-chirpy"), { recursive: true });

    const config = createInitConfig(root, "chirpy");
    const paths = config.paths as Record<string, string>;
    expect(paths.scss).toBe("_sass");
    expect(paths.scssComponents).toBe("_sass/jekyll-theme-chirpy/components");
    expect(paths.components).toBe("_includes/components");
    expect(config.writeMode).toBe("safe-write");
  });

  it("does not duplicate the theme directory when sass_dir already points to it", () => {
    const root = makeProject();
    fs.writeFileSync(
      path.join(root, "_config.yml"),
      "sass:\n  sass_dir: _sass/jekyll-theme-chirpy\n",
    );
    fs.mkdirSync(path.join(root, "_sass", "jekyll-theme-chirpy"), { recursive: true });

    const config = createInitConfig(root, "chirpy");
    expect((config.paths as Record<string, string>).scssComponents).toBe(
      "_sass/jekyll-theme-chirpy/components",
    );
  });

  it("creates a config without overwriting an existing file by default", () => {
    const root = makeProject();
    const result = initializeProject(root, "standard");
    expect(JSON.parse(fs.readFileSync(result.configPath, "utf8")).paths.scss).toBe("_sass");
    expect(() => initializeProject(root, "chirpy")).toThrow(/already exists/);
  });
});
