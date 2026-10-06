---
title: card
---

# card

## Overview

Content container with optional title, body, and footer.

## Usage

```liquid
{% include components/card.html title="Plan" body="Details here" variant="featured" %}
```

## Parameters

| Name | Type | Default | Description |
|------|------|---------|-------------|
| title | string | `""` | Card heading |
| body | string | `""` | Main body text |
| content | string | — | Trusted nested HTML content |
| footer | string | — | Trusted HTML for the footer region |
| variant | string | `"default"` | default, elevated, featured |
| class | string | `""` | Extra CSS classes |
| id | string | — | Optional element id |

## Variants

- `default`
- `elevated`
- `featured`

## Example

See `examples/components/card.html`.

## Accessibility

- Uses `<article>` for independent content
- Title rendered as heading for structure

## Security

The title and body are HTML-escaped. `content` and `footer` are rendered as HTML and should only contain trusted markup.

## Notes

Part of the sample Jekyll Component Framework.
