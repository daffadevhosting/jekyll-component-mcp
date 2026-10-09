---
title: footer
---

# footer

## Overview

Site-level footer with escaped text and optional navigation links.

## Usage

```liquid
{% include components/footer.html text="Copyright 2026 Example site" links=site.navigation %}
```

## Parameters

| Name | Type | Default | Description |
|------|------|---------|-------------|
| text | string | Current year and `site.title` | Escaped footer text |
| links | array | none | Optional links with `title` and `url` |
| nav_label | string | `Footer navigation` | Accessible navigation label |
| class | string | `""` | Extra CSS classes |
| id | string | — | Optional element id |

## Accessibility

- Uses a contentinfo landmark and a labeled `<nav>` when links are present.
- Footer text and link labels are HTML-escaped.

## Example

See `examples/components/footer.html`.