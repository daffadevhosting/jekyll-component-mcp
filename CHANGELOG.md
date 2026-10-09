# Changelog

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
