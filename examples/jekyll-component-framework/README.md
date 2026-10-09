# Jekyll Component Framework (example)

Minimal sample site for exercising **jekyll-component-mcp**.

## Structure

```
_includes/components/   # Liquid components (button, card, alert, header, footer)
assets/scss/
  tokens/               # Design tokens (CSS custom properties)
  components/           # Component SCSS partials
docs/components/        # Component documentation
examples/components/    # Live example pages
```

## Build

Requires Ruby + Bundler + Jekyll:

```bash
bundle exec jekyll serve
```

Or use the MCP server:

```bash
npx jekyll-component-mcp --root .
```
