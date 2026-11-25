# Thicket UI (MCP example)

This fixture mirrors the Liquid includes, SCSS, and JavaScript from
[daffadevhosting/jekyll-component-framework](https://github.com/daffadevhosting/jekyll-component-framework).
It is the Thicket-specific example for **jekyll-component-mcp**, not a required
framework for other Jekyll projects. The synced source revision is
`66e77ee04bc179f1b70ec8506cc83cd05e962502`.

## Structure

```
_includes/              # Framework components, sections, and partials
assets/scss/             # Framework tokens, components, and sections
assets/js/               # Framework interactions
docs/components/         # Button, card, and alert documentation
examples/components/     # Live examples
```

The MCP automatically uses Thicket conventions when the configured SCSS
directory contains both `_framework.scss` and `_tokens.scss`. Projects without
those files continue to use the normal Jekyll conventions.

## Build

Requires Ruby + Bundler + Jekyll:

```bash
bundle install
bundle exec jekyll serve
```

Or use the MCP server:

```bash
npx jekyll-component-mcp --root .
```
