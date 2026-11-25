---
layout: default
title: Card
description: Card component documentation
permalink: /docs/components/card/
---

# Card

Container for grouped content — title, body, media, and footer.

## Usage

```liquid
{% raw %}{% include components/card.html
   title="Feature"
   subtitle="Optional subtitle"
   body="Description text goes here."
   elevated=true
   hoverable=true
   glare=true
   border_beam=true
%}{% endraw %}
```

## Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `title` | string | — | Card heading |
| `subtitle` | string | — | Secondary text under title |
| `body` | HTML | — | Trusted HTML for the main content |
| `content` | HTML | — | Trusted HTML body alternative |
| `footer` | HTML | — | Trusted HTML footer content |
| `media` | string | — | Image URL |
| `media_alt` | string | `""` | Image alt text |
| `hoverable` | boolean | false | Lift and elevate on hover |
| `glare` | boolean | false | Show pointer-tracked glare on hover/focus |
| `border_beam` | boolean | false | Add a slow animated border accent |
| `elevated` | boolean | false | Stronger shadow |
| `borderless` | boolean | false | No border |
| `class` | string | — | Extra classes |
| `id` | string | — | Element id |

## Example

<div class="l-grid l-grid--cols-2 u-mb-6">
{% include components/card.html title="Elevated" body="Card with elevated shadow." elevated=true %}
{% include components/card.html title="Hoverable + glare" body="Move the pointer over this card." hoverable=true glare=true %}
{% include components/card.html title="Border beam" body="A featured card with a warm border accent." border_beam=true %}
</div>

## Accessibility

Uses `<article>` semantics. Provide meaningful titles. Decorative images should use empty `alt`.

The `body`, `content`, and `footer` slots render unescaped HTML. Only pass trusted markup from templates or trusted project data.
