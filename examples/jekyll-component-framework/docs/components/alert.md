---
layout: default
title: Alert
description: Alert component documentation
permalink: /docs/components/alert/
---

# Alert

Inline feedback messages for success, warning, error, and info states.

## Usage

```liquid
{% raw %}{% include components/alert.html
   variant="success"
   title="Saved"
   message="Your changes have been saved."
   dismissible=true
%}{% endraw %}
```

## Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `variant` | string | `info` | `info` `success` `warning` `danger` `neutral` |
| `title` | string | — | Optional heading |
| `message` | string | — | Body text (required) |
| `dismissible` | boolean | false | Show close button |
| `class` | string | — | Extra classes |
| `id` | string | — | Element id |

## Variants

{% include components/alert.html variant="info" title="Info" message="Informational message." %}
{% include components/alert.html variant="success" title="Success" message="Action completed." %}
{% include components/alert.html variant="warning" title="Warning" message="Please review." %}
{% include components/alert.html variant="danger" title="Error" message="Something went wrong." %}

## Accessibility

Uses `role="alert"`. Icons are `aria-hidden`. Dismiss button has an accessible label.
