---
layout: default
title: Button
description: Button component documentation
permalink: /docs/components/button/
---

# Button

Primary action component. Renders as a native `<button>` or `<a>` depending on `href`.

## Usage

```liquid
{% raw %}{% include components/button.html
   label="Get Started"
   href="/pricing/"
   variant="primary"
   size="lg"
   ripple=true
%}{% endraw %}
```

## Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `label` | string | — | Button text |
| `href` | string | — | If set, renders as a link (navigation semantics) |
| `variant` | string | `primary` | `primary` `secondary` `outline` `ghost` `danger` `success` |
| `size` | string | `md` | `sm` `md` `lg` |
| `type` | string | `button` | `button` `submit` `reset` (only for `<button>`) |
| `disabled` | boolean | false | Disabled state |
| `ripple` | boolean | false | Show a pointer-positioned ripple on click and a centered ripple on keyboard activation |
| `modal_open` | string | — | Modal id to open when the button is clicked |
| `offcanvas_open` | string | — | Offcanvas panel id to open |
| `icon` | string | — | Icon name |
| `icon_position` | string | `left` | `left` `right` |
| `icon_only` | boolean | false | Icon-only button |
| `block` | boolean | false | Full width |
| `class` | string | — | Extra classes |
| `id` | string | — | Element id |
| `aria_label` | string | — | Accessible label |

`href` may be a relative path, fragment, query, or an `http`, `https`, `mailto`, or `tel` URL. Unsupported schemes (including `javascript:` and protocol-relative URLs) render as a non-interactive disabled label instead of a link.

## Variants

<div class="u-flex u-gap-3 u-flex-wrap u-mb-6">
{% include components/button.html label="Primary" variant="primary" %}
{% include components/button.html label="Secondary" variant="secondary" %}
{% include components/button.html label="Outline" variant="outline" %}
{% include components/button.html label="Ghost" variant="ghost" %}
{% include components/button.html label="Danger" variant="danger" %}
{% include components/button.html label="Success" variant="success" %}
{% include components/button.html label="Ripple" variant="primary" ripple=true %}
</div>

## Accessibility

- **No `href`** → native `<button>` (action semantics)
- **With `href`** → native `<a>` (link / navigation semantics). Does **not** use `role="button"`
- **`href` + `disabled`** → non-interactive `<span role="link" aria-disabled="true">` so the URL cannot be activated
- Visible focus ring via `:focus-visible`
- Set `ripple=true` to enable the decorative ripple; it respects `prefers-reduced-motion`
- Icon-only controls require `aria_label` or `label`
