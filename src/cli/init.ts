import fs from "node:fs";
import path from "node:path";
import { DEFAULT_PATHS } from "../config/constants.js";
import { resolveProjectRoot } from "../security/path-policy.js";
import { parseYaml } from "../utils/yaml.js";

export type ThemePreset = "standard" | "chirpy" | "minimal-mistakes";

const THEME_DIRECTORIES: Record<Exclude<ThemePreset, "standard">, string> = {
  chirpy: "jekyll-theme-chirpy",
  "minimal-mistakes": "minimal-mistakes",
};

function readJekyllConfig(root: string): Record<string, unknown> {
  for (const filename of ["_config.yml", "_config.yaml"]) {
    const file = path.join(root, filename);
    if (!fs.existsSync(file)) continue;
    const parsed: unknown = parseYaml(fs.readFileSync(file, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  }
  return {};
}

function isDirectory(root: string, relativePath: string): boolean {
  const candidate = path.resolve(root, relativePath);
  const relative = path.relative(root, candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return false;
  try {
    return fs.statSync(candidate).isDirectory();
  } catch {
    return false;
  }
}

function configuredSassDirectory(root: string, config: Record<string, unknown>): string | undefined {
  const sass = config.sass;
  if (!sass || typeof sass !== "object" || Array.isArray(sass)) return undefined;
  const sassDir = (sass as Record<string, unknown>).sass_dir;
  if (typeof sassDir !== "string" || path.isAbsolute(sassDir)) return undefined;
  const normalized = path.posix.normalize(sassDir.replace(/\\/g, "/"));
  if (normalized === ".." || normalized.startsWith("../")) return undefined;
  return isDirectory(root, normalized) ? normalized : undefined;
}

export function detectThemePreset(rootPath: string): ThemePreset {
  const root = resolveProjectRoot(rootPath);
  const config = readJekyllConfig(root);
  const themeValue = [config.theme, config.remote_theme]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
  let gemfile = "";
  const gemfilePath = path.join(root, "Gemfile");
  if (fs.existsSync(gemfilePath)) gemfile = fs.readFileSync(gemfilePath, "utf8").toLowerCase();

  if (
    themeValue.includes("chirpy") ||
    gemfile.includes("jekyll-theme-chirpy") ||
    isDirectory(root, "_sass/jekyll-theme-chirpy")
  ) {
    return "chirpy";
  }
  if (
    themeValue.includes("minimal-mistakes") ||
    themeValue.includes("minimal_mistakes") ||
    gemfile.includes("minimal-mistakes-jekyll") ||
    isDirectory(root, "_sass/minimal-mistakes")
  ) {
    return "minimal-mistakes";
  }
  return "standard";
}

export function createInitConfig(rootPath: string, preset: ThemePreset): Record<string, unknown> {
  const root = resolveProjectRoot(rootPath);
  const jekyllConfig = readJekyllConfig(root);
  const sassDir = configuredSassDirectory(root, jekyllConfig);
  const scssRoot =
    sassDir ??
    (isDirectory(root, "assets/scss")
      ? "assets/scss"
      : isDirectory(root, "_sass")
        ? "_sass"
        : "_sass");

  const themeScssRoot =
    preset === "standard"
      ? scssRoot
      : scssRoot.endsWith(`/${THEME_DIRECTORIES[preset]}`)
        ? scssRoot
        : `${scssRoot}/${THEME_DIRECTORIES[preset]}`;
  const scssComponents = `${themeScssRoot}/components`;

  const paths = {
    ...DEFAULT_PATHS,
    components: isDirectory(root, "_includes/components")
      ? "_includes/components"
      : DEFAULT_PATHS.components,
    includes: isDirectory(root, "_includes") ? "_includes" : DEFAULT_PATHS.includes,
    layouts: isDirectory(root, "_layouts") ? "_layouts" : DEFAULT_PATHS.layouts,
    data: isDirectory(root, "_data") ? "_data" : DEFAULT_PATHS.data,
    assets: isDirectory(root, "assets") ? "assets" : DEFAULT_PATHS.assets,
    sass: isDirectory(root, "_sass") ? "_sass" : DEFAULT_PATHS.sass,
    scss: scssRoot,
    scssComponents,
    scssSections: `${scssRoot}/sections`,
  };

  return {
    root: ".",
    writeMode: "safe-write",
    build: {
      command: "bundle exec jekyll build",
      timeout: 120000,
    },
    paths,
  };
}

export function initializeProject(
  rootPath: string,
  preset: ThemePreset,
  force = false,
): { configPath: string; preset: ThemePreset; paths: Record<string, string> } {
  const root = resolveProjectRoot(rootPath);
  const configPath = path.join(root, ".jekyll-mcp.json");
  const config = createInitConfig(root, preset);

  try {
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, {
      encoding: "utf8",
      flag: force ? "w" : "wx",
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(
        `.jekyll-mcp.json already exists in ${root}. Use --force to replace it.`,
      );
    }
    throw error;
  }

  return {
    configPath,
    preset,
    paths: config.paths as Record<string, string>,
  };
}
