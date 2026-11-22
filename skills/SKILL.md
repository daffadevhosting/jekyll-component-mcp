---
name: jekyll-component-mcp
description: Install, configure, and use the jekyll-component-mcp MCP server with Jekyll projects, including Thicket UI projects. Use when setting up the server or inspecting, creating, validating, documenting, or building reusable Jekyll Liquid/SCSS components.
---

# Jekyll Component MCP

Use this skill to set up `jekyll-component-mcp` as an MCP server and operate it safely in a Jekyll project.

## Requirements

- Node.js 20 or newer.
- An MCP-compatible client such as Claude Desktop, Claude Code, Cursor, or VS Code.
- A Jekyll project directory to use as the server's project root. Ruby/Bundler and Jekyll are only needed for build and doctor operations.

The package is an MCP server, not a Jekyll theme or a runtime dependency for the site. Install it globally or let the MCP client run it with `npx`.
At startup, the server checks the npm registry for a newer release at most once per day and logs an update notice when one is available. Registry or network failures do not prevent startup.

## Install and configure

For a global CLI installation:

```sh
npm install --global jekyll-component-mcp
jekyll-component-mcp --root /absolute/path/to/jekyll-project
```

For an MCP client that launches stdio servers with `npx`, configure:

```json
{
  "mcpServers": {
    "jekyll-component": {
      "command": "npx",
      "args": ["-y", "jekyll-component-mcp", "--root", "/absolute/path/to/jekyll-project"]
    }
  }
}
```

Replace the root with the actual Jekyll project path. For VS Code, use the client's MCP server configuration and its workspace-folder variable when available. Alternatively set `JEKYLL_PROJECT_ROOT` or `JEKYLL_COMPONENT_MCP_ROOT`; CLI `--root` takes precedence.

To run a local checkout during development, use `npm install`, `npm run build`, then configure the client to launch `node /absolute/path/to/jekyll-component-mcp/dist/index.js` with `--root` and the project path as arguments.

To create a project configuration interactively or with automatic theme detection, run:

```sh
npx -y jekyll-component-mcp init
```

Use `--root <path>` to target another project, `--preset auto|standard|chirpy|minimal-mistakes` to select a preset, and `--force` only when you intend to replace an existing `.jekyll-mcp.json`. The initializer detects common include, Sass, layout, and data directories and keeps generated paths relative to the project root.

## Safe operating workflow

1. Confirm the MCP server is connected and its `jekyll_*` tools are available. If not, check Node.js 20+, the configured package command, and that the project root exists.
2. Start with `jekyll_project_info`. Use `jekyll_project_scan` when file locations or architecture matter. Use `jekyll_config_get` for site configuration; secrets are redacted.
3. Before changing an existing component, inspect it with `jekyll_component_list` and `jekyll_component_get`. Inspect SCSS with `jekyll_scss_list` / `jekyll_scss_get`, tokens with `jekyll_token_list` / `jekyll_token_get`, and Liquid includes or layouts with their corresponding list/get tools.
4. Match the repository's existing component, naming, Liquid, SCSS, and documentation conventions. Do not assume default paths when scan results are available.
5. For requested writes, use the smallest relevant tool. For `jekyll_component_create`, `dry_run: true` returns planned operations and unified diffs; review them before applying. For `jekyll_docs_update`, dry-run reports only the target path, not a content diff, and a normal update regenerates the target file. Clearly report when the configured write mode prevents a change.
6. After changes, run `jekyll_component_validate` for a component and/or `jekyll_validate`. If the project has the needed Ruby/Jekyll environment, run `jekyll_build` to verify the site.

## Thicket UI compatibility

The server recognizes a Thicket-style project when the configured SCSS root
contains both `_framework.scss` and `_tokens.scss`. Confirm the project layout
with `jekyll_project_scan` and the configured paths before relying on this
behavior; a Jekyll site with a different Sass architecture should retain its
own conventions.

For a recognized project, `jekyll_component_create`:

- Keeps the include filename based on the requested component name, but uses
  Thicket's `c-` BEM class prefix in generated Liquid and SCSS (for example,
  `alert` produces `.c-alert`).
- Registers the SCSS partial with `@use "components/<name>";` in
  `assets/scss/_framework.scss` (or the configured SCSS root's framework file).
- When `javascript: true` is requested, creates a JavaScript initializer and
  attempts to add its import and call to the existing `assets/js/main.js`
  `DOMContentLoaded` callback. This is an opt-in scaffold: the generated
  initializer contains a TODO and does not implement component behavior.
- Includes framework-entry-point updates in `dry_run: true` operations/diffs
  when those files can be read. Review the diffs before applying changes.

If the JavaScript entry point or expected callback is missing or differs from
the supported pattern, creation reports a warning; inspect the file and
register the initializer manually rather than forcing an edit. The validator
accepts either `.name` or `.c-name` as the component's BEM root. Preview
recognizes the `c-` prefix from existing Liquid classes.

This compatibility does not mean every Thicket component API can be inferred
or reproduced automatically. Before changing an existing component, inspect
its Liquid include and docs, preserve its documented parameters and semantics,
and use the existing component source as authority. Never replace framework
entry points, theme tokens, or global JavaScript initialization wholesale.

## Component and stylesheet lifecycle

- Use `jekyll_component_update` to replace only the explicitly supplied
  associated source files. It does not create missing files or infer content;
  inspect with `jekyll_component_get`, then review its dry-run diffs.
- Use `jekyll_component_rename` to rename the component's associated files and
  matching references under configured source roots. It removes the old paths,
  so inspect every dry-run operation/diff first; applying requires
  `full-write` and `confirm: true`.
- Use `jekyll_component_duplicate` to copy the component's existing associated
  files under a new name. The source remains unchanged; dry-run shows the
  duplicate files and any framework registration updates.
- Use `jekyll_component_dependencies` for read-only component include, Sass,
  and JavaScript references, including reverse dependents. It reports detected
  static references, not runtime/dynamic dependencies.
- Use `jekyll_component_export` for a read-only JSON bundle of the existing
  component files. It does not create an archive or write into the project.
- Use `jekyll_component_test` for static component validation plus a Jekyll
  build by default. Set `run_build: false` to skip the site build. A successful
  build is project-level integration evidence, not a component unit test.
- Use `jekyll_scss_update` to replace an existing file under the configured
  SCSS root; it does not create a missing file.
- Use `jekyll_scss_delete` only for an explicitly requested stylesheet
  deletion. Review its dry-run, which includes direct Sass import cleanup;
  applying requires `full-write` and `confirm: true`.
- `jekyll_component_delete` is also destructive: review `dry_run: true` before
  deleting, then use `confirm: true` in `full-write` mode.

## Tool reference

| Task | MCP tools |
| --- | --- |
| Project overview and structure | `jekyll_project_info`, `jekyll_project_scan`, `jekyll_config_get` |
| Components | `jekyll_component_list`, `jekyll_component_get`, `jekyll_component_catalog`, `jekyll_component_create`, `jekyll_component_update`, `jekyll_component_rename`, `jekyll_component_duplicate`, `jekyll_component_preview`, `jekyll_component_validate`, `jekyll_component_test`, `jekyll_component_dependencies`, `jekyll_component_export`, `jekyll_component_delete` |
| Component aliases | `list_components`, `inspect_component`, `create_component`, `validate_component` |
| Catalog and preview aliases | `component_catalog`, `preview_component` |
| SCSS and design tokens | `jekyll_scss_list`, `jekyll_scss_get`, `jekyll_scss_create`, `jekyll_scss_update`, `jekyll_scss_delete`, `jekyll_token_list`, `jekyll_token_get`, `jekyll_token_update` |
| Liquid includes and layouts | `jekyll_include_list`, `jekyll_include_get`, `jekyll_layout_list`, `jekyll_layout_get` |
| Documentation | `jekyll_docs_create`, `jekyll_docs_update` |
| Validation and build | `jekyll_validate`, `jekyll_build`, `jekyll_doctor` |

For component creation, `jekyll_component_create` or `create_component` accepts `name`, optional `category`, `variants`, `javascript`, `documentation`, `example`, and `dry_run`. Prefer this tool over separate file creation when the user asks for a reusable component; it scaffolds the Liquid component and associated assets/docs/examples. `inspect_component` reports Liquid include parameters and detected defaults/guards alongside source and SCSS details. `validate_component` checks Liquid fallbacks/guards and BEM/SCSS naming.

Use `jekyll_component_catalog` or `component_catalog` for a read-only overview of discovered components, including status, tags, summaries, path coverage, variants, and parameter counts. Use `jekyll_component_preview` or `preview_component` to generate a lightweight HTML sample with a selected variant and parameters; it is a preview, not a full Jekyll render. `jekyll_docs_update` accepts `category` as well as overview, variants, parameters, accessibility guidance, and notes. Its dry-run only identifies the target path, so inspect the existing documentation before applying an update that could replace authored content.

Use the review prompts when supported by the MCP client: `jekyll_component_review`, `jekyll_accessibility_review`, `jekyll_performance_review`, and `jekyll_production_review`. Available resources include `jekyll://project`, `jekyll://components`, `jekyll://tokens`, `jekyll://config`, and `jekyll://documentation`.

## Write and security rules

- The default mode is `safe-write`: creates and updates are allowed; destructive operations are not. `read-only` disables writes. `full-write` allows destructive operations only when the tool also receives `confirm: true`.
- Never call `jekyll_component_delete` unless the user explicitly requested deletion and confirms the target component. The tool requires both `full-write` mode and `confirm: true`; do not change modes just to bypass this safeguard.
- Use `dry_run` for supported mutating tools before applying a non-trivial change. A dry run is a preview, not an applied change.
- Keep paths relative to or within the configured project root. The server rejects traversal and symlink escapes; do not try to bypass those checks.
- Build commands are allowlisted to Jekyll build/clean/doctor and supported `bundle exec` variants. Do not treat this server as an arbitrary shell or file-access tool.
- Do not claim a change or build succeeded unless the tool result confirms it. Surface validation errors and warnings accurately.

## Common configuration

An optional `.jekyll-mcp.json` in the project root can set the root, write mode, build command/timeout, and project paths:

```json
{
  "root": ".",
  "writeMode": "safe-write",
  "build": {
    "command": "bundle exec jekyll build",
    "timeout": 120000
  },
  "paths": {
    "components": "_includes/components",
    "scss": "assets/scss",
    "docs": "docs",
    "layouts": "_layouts"
  }
}
```

The server also accepts `--readonly`, `--safe-write`, `--full-write`, `--timeout <ms>`, `--max-file-size <bytes>`, and `--debug` CLI options. Prefer the default `safe-write` mode unless the user has a specific need for another mode.