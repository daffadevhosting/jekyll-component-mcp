/**
 * Structured project architecture scan for Jekyll + component framework.
 */

import path from "node:path";
import type { McpConfig } from "../config/environment.js";
import { safeExists, safeReadDir, safeWalk } from "../utils/filesystem.js";
import { resolveSafePath, toRelative } from "../security/path-policy.js";

export interface ProjectScanResult {
  root: string;
  jekyll: boolean;
  configFiles: string[];
  directories: Record<string, boolean>;
  layouts: string[];
  includes: string[];
  components: Array<{
    name: string;
    liquid?: string;
    scss?: string;
    javascript?: string;
    documentation?: string;
    example?: string;
  }>;
  sections: string[];
  scssFiles: string[];
  jsFiles: string[];
  docsFiles: string[];
  hasBundler: boolean;
  hasPackageJson: boolean;
}

function listHtmlIn(root: string, relDir: string, maxDepth = 4): string[] {
  if (!safeExists(root, relDir)) return [];
  const out: string[] = [];
  for (const entry of safeWalk(root, relDir, { maxDepth, extensions: [".html", ".liquid"] })) {
    if (!entry.isDirectory) out.push(entry.relativePath);
  }
  return out;
}

function listScss(root: string, relDir: string, maxDepth = 6): string[] {
  if (!safeExists(root, relDir)) return [];
  const out: string[] = [];
  for (const entry of safeWalk(root, relDir, { maxDepth, extensions: [".scss", ".sass", ".css"] })) {
    if (!entry.isDirectory) out.push(entry.relativePath);
  }
  return out;
}

function componentNameFromPath(filePath: string): string {
  const base = path.basename(filePath, path.extname(filePath));
  return base.replace(/^_/, "").toLowerCase();
}

export function scanProject(config: McpConfig): ProjectScanResult {
  const { root, paths } = config;

  const configFiles: string[] = [];
  for (const name of ["_config.yml", "_config.yaml", "_config.toml", "config.yml"]) {
    if (safeExists(root, name)) configFiles.push(name);
  }

  const directories: Record<string, boolean> = {
    _layouts: safeExists(root, paths.layouts),
    _includes: safeExists(root, paths.includes),
    _data: safeExists(root, paths.data),
    _posts: safeExists(root, paths.posts),
    _sass: safeExists(root, paths.sass),
    assets: safeExists(root, paths.assets),
    docs: safeExists(root, paths.docs),
    examples: safeExists(root, paths.examples),
    _site: safeExists(root, paths.site),
    components: safeExists(root, paths.components),
    sections: safeExists(root, paths.sections),
    scss: safeExists(root, paths.scss),
  };

  const layouts = listHtmlIn(root, paths.layouts);
  const includes = listHtmlIn(root, paths.includes, 5);

  // Components under _includes/components or configured path
  const componentLiquid = listHtmlIn(root, paths.components, 3);
  const componentMap = new Map<
    string,
    {
      name: string;
      liquid?: string;
      scss?: string;
      javascript?: string;
      documentation?: string;
      example?: string;
    }
  >();

  for (const f of componentLiquid) {
    const name = componentNameFromPath(f);
    componentMap.set(name, { name, liquid: f });
  }

  // SCSS components
  const scssComponents = listScss(root, paths.scssComponents ?? path.join(paths.scss, "components"), 3);
  for (const f of scssComponents) {
    const name = componentNameFromPath(f);
    const existing = componentMap.get(name) ?? { name };
    existing.scss = f;
    componentMap.set(name, existing);
  }

  // Also scan main scss for component-like files
  const allScss = listScss(root, paths.scss, 5);
  for (const f of allScss) {
    if (f.includes("components/") || f.includes("component")) {
      const name = componentNameFromPath(f);
      if (!componentMap.has(name)) {
        componentMap.set(name, { name, scss: f });
      }
    }
  }

  // JS components
  if (safeExists(root, paths.jsComponents)) {
    for (const entry of safeWalk(root, paths.jsComponents, {
      maxDepth: 3,
      extensions: [".js", ".ts", ".mjs"],
    })) {
      if (entry.isDirectory) continue;
      const name = componentNameFromPath(entry.relativePath);
      const existing = componentMap.get(name) ?? { name };
      existing.javascript = entry.relativePath;
      componentMap.set(name, existing);
    }
  }

  // Docs
  if (safeExists(root, paths.docsComponents)) {
    for (const entry of safeWalk(root, paths.docsComponents, {
      maxDepth: 3,
      extensions: [".md", ".markdown", ".html"],
    })) {
      if (entry.isDirectory) continue;
      const name = componentNameFromPath(entry.relativePath);
      const existing = componentMap.get(name) ?? { name };
      existing.documentation = entry.relativePath;
      componentMap.set(name, existing);
    }
  }

  // Examples
  if (safeExists(root, paths.examplesComponents)) {
    for (const entry of safeWalk(root, paths.examplesComponents, {
      maxDepth: 3,
      extensions: [".html", ".md"],
    })) {
      if (entry.isDirectory) continue;
      const name = componentNameFromPath(entry.relativePath);
      const existing = componentMap.get(name) ?? { name };
      existing.example = entry.relativePath;
      componentMap.set(name, existing);
    }
  }

  const sections = listHtmlIn(root, paths.sections, 3).map(componentNameFromPath);

  const jsFiles: string[] = [];
  if (safeExists(root, paths.js)) {
    for (const entry of safeWalk(root, paths.js, { maxDepth: 5, extensions: [".js", ".ts", ".mjs"] })) {
      if (!entry.isDirectory) jsFiles.push(entry.relativePath);
    }
  }

  const docsFiles: string[] = [];
  if (safeExists(root, paths.docs)) {
    for (const entry of safeWalk(root, paths.docs, {
      maxDepth: 5,
      extensions: [".md", ".markdown", ".html"],
    })) {
      if (!entry.isDirectory) docsFiles.push(entry.relativePath);
    }
  }

  const hasBundler =
    safeExists(root, "Gemfile") || safeExists(root, "Gemfile.lock");
  const hasPackageJson = safeExists(root, "package.json");

  return {
    root,
    jekyll: configFiles.length > 0 || directories._layouts || directories._includes,
    configFiles,
    directories,
    layouts: layouts.map((f) => toRelative(root, resolveSafePath(root, f))),
    includes: includes.map((f) => toRelative(root, resolveSafePath(root, f))),
    components: [...componentMap.values()].sort((a, b) => a.name.localeCompare(b.name)),
    sections,
    scssFiles: allScss,
    jsFiles,
    docsFiles,
    hasBundler,
    hasPackageJson,
  };
}

export function detectScssArchitecture(root: string, scssRoot: string): string[] {
  const layers: string[] = [];
  const candidates = [
    "tokens",
    "abstracts",
    "variables",
    "mixins",
    "functions",
    "base",
    "vendors",
    "utilities",
    "components",
    "sections",
    "layout",
    "pages",
    "themes",
  ];
  for (const c of candidates) {
    if (safeExists(root, path.join(scssRoot, c)) || safeExists(root, path.join(scssRoot, `_${c}`))) {
      layers.push(c);
    }
  }
  // Also check for files
  try {
    const entries = safeReadDir(root, scssRoot) as string[];
    for (const e of entries) {
      const name = e.replace(/^_/, "").replace(/\.(scss|sass)$/, "");
      if (candidates.includes(name) && !layers.includes(name)) {
        layers.push(name);
      }
    }
  } catch {
    /* ignore */
  }
  return layers;
}
