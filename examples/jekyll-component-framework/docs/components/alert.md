---
title: alert
---

# alert

## Overview

Accessible, non-interactive message for status updates, notices, and warnings.

## Usage

```liquid
{% include components/alert.html title="Saved" message="Your changes are live." variant="success" %}
{% include components/alert.html title="Heads up" message="Review this before continuing." variant="warning" %}
```

## Parameters

| Name | Type | Default | Description |
|------|------|---------|-------------|
| title | string | `""` | Optional heading, rendered as text |
| message | string | `""` | Optional message, rendered as text |
| content | string | — | Optional trusted nested HTML |
| variant | string | `"info"` | Visual style: info, success, warning, danger |
| class | string | `""` | Extra CSS classes |
| id | string | — | Optional element id |

## Variants

- `info`
- `success`
- `warning`
- `danger`

## Accessibility

- Uses `role="status"` for info and success messages.
- Uses `role="alert"` for warning and danger messages.
- Does not add a dismiss control or JavaScript behavior.

## Security

Title and message are HTML-escaped. `content` is rendered as HTML and should only contain trusted markup.

## Example

See `examples/components/alert.html`.
