---
name: jekyll-component-mcp
description: Install, configure, and use the jekyll-component-mcp MCP server with Jekyll projects. Use when setting up the server or inspecting, creating, validating, documenting, or building reusable Jekyll Liquid/SCSS components.
---

# Jekyll Component MCP

Use this skill to set up `jekyll-component-mcp` as an MCP server and operate it safely in a Jekyll project.

## Requirements

- Node.js 20 or newer.
- An MCP-compatible client such as Claude Desktop, Claude Code, Cursor, or VS Code.
- A Jekyll project directory to use as the server's project root. Ruby/Bundler and Jekyll are only needed for build and doctor operations.

The package is an MCP server, not a Jekyll theme or a runtime dependency for the site. Install it globally or let the MCP client run it with `npx`.

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
5. For requested writes, use the smallest relevant tool. Preview supported mutations with `dry_run: true`, review the reported operations, then run with `dry_run: false` or omit `dry_run` to apply them. Clearly report when the configured write mode prevents a change.
6. After changes, run `jekyll_component_validate` for a component and/or `jekyll_validate`. If the project has the needed Ruby/Jekyll environment, run `jekyll_build` to verify the site.

## Tool reference

| Task | MCP tools |
| --- | --- |
| Project overview and structure | `jekyll_project_info`, `jekyll_project_scan`, `jekyll_config_get` |
| Components | `jekyll_component_list`, `jekyll_component_get`, `jekyll_component_create`, `jekyll_component_validate`, `jekyll_component_delete` |
| Component aliases | `list_components`, `inspect_component`, `create_component`, `validate_component` |
| SCSS and design tokens | `jekyll_scss_list`, `jekyll_scss_get`, `jekyll_scss_create`, `jekyll_token_list`, `jekyll_token_get`, `jekyll_token_update` |
| Liquid includes and layouts | `jekyll_include_list`, `jekyll_include_get`, `jekyll_layout_list`, `jekyll_layout_get` |
| Documentation | `jekyll_docs_create`, `jekyll_docs_update` |
| Validation and build | `jekyll_validate`, `jekyll_build`, `jekyll_doctor` |

For component creation, `jekyll_component_create` or `create_component` accepts `name`, optional `category`, `variants`, `javascript`, `documentation`, `example`, and `dry_run`. Prefer this tool over separate file creation when the user asks for a reusable component; it scaffolds the Liquid component and associated assets/docs/examples. `inspect_component` reports Liquid include parameters and detected defaults/guards alongside source and SCSS details. `validate_component` checks Liquid fallbacks/guards and BEM/SCSS naming.

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