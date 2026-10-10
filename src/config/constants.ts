/**
 * Project-wide constants for jekyll-component-mcp.
 */

export const PACKAGE_NAME = "jekyll-component-mcp";
export const PACKAGE_VERSION = "1.2.2";

/** Default write policy when none is specified. */
export const DEFAULT_WRITE_MODE = "safe-write" as const;

/** Default Jekyll build timeout in milliseconds. */
export const DEFAULT_BUILD_TIMEOUT_MS = 120_000;

/** Default maximum readable/writable file size in bytes (2 MiB). */
export const DEFAULT_MAX_FILE_SIZE = 2 * 1024 * 1024;

/** Default maximum directory scan depth. */
export const DEFAULT_MAX_SCAN_DEPTH = 12;

/** Allowed write modes. */
export const WRITE_MODES = ["read-only", "safe-write", "full-write"] as const;
export type WriteMode = (typeof WRITE_MODES)[number];

/** Default framework path conventions (detected/adapted at runtime). */
export const DEFAULT_PATHS = {
  components: "_includes/components",
  sections: "_includes/sections",
  layouts: "_layouts",
  includes: "_includes",
  scss: "assets/scss",
  scssComponents: "assets/scss/components",
  scssSections: "assets/scss/sections",
  js: "assets/js",
  jsComponents: "assets/js/components",
  docs: "docs",
  docsComponents: "docs/components",
  examples: "examples",
  examplesComponents: "examples/components",
  data: "_data",
  posts: "_posts",
  sass: "_sass",
  assets: "assets",
  site: "_site",
} as const;

/** Commands that are always allowed (allowlisted). */
export const ALLOWED_BUILD_COMMANDS = [
  "jekyll build",
  "jekyll clean",
  "jekyll doctor",
  "bundle exec jekyll build",
  "bundle exec jekyll clean",
  "bundle exec jekyll doctor",
] as const;

/** Forbidden command tokens (hard deny). */
export const FORBIDDEN_COMMAND_TOKENS = [
  "rm",
  "sudo",
  "curl",
  "wget",
  "bash",
  "sh",
  "powershell",
  "cmd",
  "eval",
  "exec",
  "chmod",
  "chown",
  "dd",
  "mkfs",
  ">",
  ">>",
  "|",
  ";",
  "&&",
  "||",
  "`",
  "$(",
] as const;

/** Component name pattern: kebab-case, starts with letter. */
export const COMPONENT_NAME_REGEX = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/** Maximum component name length. */
export const MAX_COMPONENT_NAME_LENGTH = 64;
