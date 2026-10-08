# jekyll-component-mcp

**AI-native development MCP server for Jekyll projects and reusable Liquid/SCSS/JavaScript components.**

Production-ready Model Context Protocol (MCP) server that lets AI agents understand, inspect, create, validate, build, and document Jekyll component frameworks.

## Features

- **Jekyll-aware tools** — not a generic filesystem wrapper
- **Component lifecycle** — list, get, create, validate, delete
- **SCSS + design tokens** — architecture detection and safe updates
- **Secure by default** — project-root sandbox, allowlisted commands, write modes
- **Dry-run support** — preview mutations before writing
- **Resources & prompts** — structured context and review workflows for agents

## Requirements

- Node.js 20+
- A Jekyll project (optional Gemfile / Bundler)

## Install

```bash
npm install -g jekyll-component-mcp
# or use locally
npx jekyll-component-mcp --root /path/to/jekyll-project
```

## AI Skill

The package includes a skill with instructions for AI agents to install, configure, and use this MCP server. After the package is published, share this URL with an AI agent that can access web links:

<https://unpkg.com/jekyll-component-mcp@latest/skills/SKILL.md>

For repeatable instructions, replace `latest` with a published version, for example `@1.0.0`. You can ask the agent: "Read and follow this skill to set up and use jekyll-component-mcp: [skill URL]".

## Automated npm publishing

The GitHub Actions workflow publishes to npm when a version tag is pushed. Before the first release, configure npm Trusted Publishing for this GitHub repository and the `.github/workflows/publish-npm.yml` workflow. The workflow uses OIDC and does not require an npm token secret.

To publish a release, update the package version, commit the change, then push a matching tag such as `v1.0.2`. The workflow checks that the tag matches `package.json`, runs typecheck, tests, and build, then publishes the package with provenance.

## Quick start

```bash
# From your Jekyll project root
jekyll-component-mcp --root .

# Or via environment
JEKYLL_PROJECT_ROOT=/path/to/project jekyll-component-mcp
```

### MCP Inspector

```bash
npm run build
npx @modelcontextprotocol/inspector node dist/index.js --root /path/to/jekyll-project
```

## Write modes

| Mode        | Create / Update | Delete / Destructive |
|-------------|-----------------|----------------------|
| `read-only` | ❌              | ❌                   |
| `safe-write` (default) | ✅     | ❌                   |
| `full-write`| ✅              | ✅ (requires `confirm: true`) |

## CLI options

```
--root <path>           Project root
--readonly              read-only mode
--safe-write            safe-write mode (default)
--full-write            full-write mode
--timeout <ms>          Build timeout (default 120000)
--max-file-size <bytes> Max file size (default 2MiB)
--debug                 Debug logging to stderr
```

## Configuration file

Optional `.jekyll-mcp.json` in the project root:

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

## Tools (overview)

| Tool | Purpose |
|------|---------|
| `jekyll_project_info` | High-level project summary |
| `jekyll_project_scan` | Full architecture map |
| `jekyll_config_get` | Sanitized config |
| `jekyll_component_list` | List components |
| `jekyll_component_get` | Component details + sources |
| `jekyll_component_create` | Create component + SCSS + docs |
| `jekyll_component_validate` | Structured validation |
| `jekyll_component_delete` | Destructive delete (full-write + confirm) |
| `jekyll_build` | Run Jekyll build |
| `jekyll_doctor` | Run jekyll doctor |

## Resources

- `jekyll://project`
- `jekyll://components`
- `jekyll://config`

## Prompts

- `jekyll_component_review`
- `jekyll_accessibility_review`
- `jekyll_performance_review`
- `jekyll_production_review`

## Security

- **Filesystem sandbox**: every path is resolved under the project root; traversal and symlink escapes are rejected.
- **Command allowlist**: only `jekyll build|clean|doctor` (and `bundle exec` variants). No arbitrary shell.
- **Write policy**: configurable; destructive ops require `full-write` + `confirm: true`.
- **Secrets**: config reads redact common secret keys; process output is scrubbed.
- **stdio**: stdout is reserved for MCP JSON-RPC; all logs go to stderr.

## Client configuration examples

### Claude Desktop / Claude Code

```json
{
  "mcpServers": {
    "jekyll-component": {
      "command": "npx",
      "args": ["-y", "jekyll-component-mcp", "--root", "/path/to/jekyll-project"]
    }
  }
}
```

### Cursor / VS Code

Add an MCP server entry pointing at `node /path/to/jekyll-component-mcp/dist/index.js` with `--root` args as needed.

## Development

```bash
npm install
npm run typecheck
npm run build
npm test
npm run dev -- --root ./examples/jekyll-component-framework
```

## License

MIT
