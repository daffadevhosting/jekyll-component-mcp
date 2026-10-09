---
title: header
---

# header

## Overview

Site-level header with a brand link and optional responsive navigation. The default layout uses the site's `navigation` setting.

## Usage

```liquid
{% include components/header.html brand=site.title brand_url="/" links=site.navigation %}
```

Navigation items use `title` and `url` keys:

```yaml
navigation:
  - title: Home
    url: "/"
```

## Parameters

| Name | Type | Default | Description |
|------|------|---------|-------------|
| brand | string | `site.title` | Escaped brand text |
| brand_url | string | `/` | Brand destination, passed through `relative_url` |
| links | array | `site.navigation` | Optional navigation links with `title` and `url` |
| nav_label | string | `Main navigation` | Accessible navigation label |
| class | string | `""` | Extra CSS classes |
| id | string | — | Optional element id |

## Accessibility

- Uses a banner landmark and a labeled `<nav>` when links are present.
- Marks the link matching `page.url` with `aria-current="page"`.
- Includes visible keyboard focus styles; the default layout provides the skip link.

## Example

See `examples/components/header.html`.