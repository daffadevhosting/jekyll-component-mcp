# Changelog

## 1.2.2

### Changed

- Updated both distributed skill files for component catalog, HTML preview, documentation update behavior, and daily npm update notices

## 1.2.1

### Changed

- Improved `jekyll_docs_update` tool metadata with parameter descriptions and the supported `category` field

## 1.2.0

### Added

- Component catalog with categories, status, summaries, tags, variants, and parameters
- Dry-run component creation previews with unified diffs and rendered HTML previews
- Component schema validation and category metadata in generated documentation and catalog entries
- Daily npm update checks with cached results to avoid repeated network requests and notifications

## 1.1.1

### Added

- Reusable header and footer components in the example Jekyll framework, with styles, documentation, and example pages

## 1.1.0

### Added

- `jekyll-component-mcp init` with automatic Jekyll theme/path detection and standard, Chirpy, and Minimal Mistakes presets
- Component tool aliases: `list_components`, `inspect_component`, `create_component`, and `validate_component`
- Liquid include fallback/guard and BEM/SCSS naming checks
- Liquid documentation headers and safe defaults in generated components

## 1.0.0

### Added

- MCP server for Jekyll component development (stdio transport)
- Project tools: info, scan, config
- Component tools: list, get, create, validate, delete
- SCSS tools: list, get, create
- Design token tools: list, get, update
- Liquid tools: include list/get, layout list/get
- Documentation tools: create, update
- Validation and build tools
- Resources: jekyll://project, components, tokens, config, documentation
- Prompts: component, accessibility, performance, production reviews
- Security: path sandbox, command allowlist, write modes, dry-run
- Example Jekyll Component Framework project under `examples/`
