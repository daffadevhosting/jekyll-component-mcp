---
title: button
---

# button

## Overview

Primary interactive control for actions and navigation links.

## Usage

```liquid
{% include components/button.html label="Get started" variant="primary" href="/signup" %}
{% include components/button.html label="Cancel" variant="secondary" %}
```

## Parameters

| Name | Type | Default | Description |
|------|------|---------|-------------|
| label | string | `"Button"` | Visible label text |
| variant | string | `"primary"` | Visual variant: primary, secondary, danger |
| href | string | — | If set, renders an anchor instead of a button |
| type | string | `"button"` | Native button type when not a link |
| class | string | `""` | Extra CSS classes |
| id | string | — | Optional element id |
| disabled | boolean | — | Disables the button |
| target | string | — | Anchor target (adds rel for security) |

## Variants

- `primary`
- `secondary`
- `danger`

## Example

See `examples/components/button.html`.

## Accessibility

- Uses native `<button>` or `<a>` for correct semantics
- Focus-visible outline on keyboard focus
- Disabled state via native attribute

## Security

Text and attribute values are HTML-escaped. Only pass trusted URLs as `href`; escaping does not validate URL schemes.

## Notes

Part of the sample Jekyll Component Framework.
