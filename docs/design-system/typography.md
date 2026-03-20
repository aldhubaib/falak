# Typography

> Fonts loaded: `frontend/src/index.css` (Google Fonts import, line 1)
> Font config: `frontend/tailwind.config.ts` → `theme.extend.fontFamily`

> Open `preview.html` in a browser to see the type scale rendered. Sections: #typography, #text-colors

---

## Font Families

| Family | Tailwind Class | Weights Loaded | Usage |
|--------|---------------|----------------|-------|
| **Inter** | `font-sans` (default) | 400, 500, 600, 700 | All UI text |
| **JetBrains Mono** | `font-mono` | 400, 500 | Code blocks, timestamps, mono labels, hashtags |

`body` applies `font-sans` by default via `@apply bg-background text-foreground font-sans` in `index.css`.

---

## Type Scale

The app uses a mix of Tailwind's built-in sizes and custom pixel values. The **canonical scale** that should be used:

### Headings

| Level | Class | Size | Weight | When to Use |
|-------|-------|------|--------|-------------|
| Page title (list pages) | `text-sm font-semibold` | 14px / 600 | Page titles in top bars (OurChannels, Stories, Settings, etc.) |
| Page title (standalone) | `text-lg font-semibold` | 18px / 600 | Standalone pages like ProfileHome |
| Section heading | `text-[13px] font-semibold` | 13px / 600 | Section labels within a page |
| Subsection label | `text-[11px] font-medium uppercase tracking-wider text-dim` | 11px / 500 | Small uppercase labels |

### Body Text

| Level | Class | Size | When to Use |
|-------|-------|------|-------------|
| Default body | `text-[13px]` | 13px | Primary content text, table cells, descriptions |
| Small body | `text-[12px]` | 12px | Secondary metadata, timestamps |
| Tiny | `text-[11px]` | 11px | Badges, labels, auxiliary info |
| Micro | `text-[10px]` | 10px | Uppercase tracking labels, stat labels |

### Monospace

| Level | Class | Size | When to Use |
|-------|-------|------|-------------|
| Code body | `text-[13px] font-mono` | 13px | Code blocks, script editor |
| Mono label | `text-[10px] font-mono uppercase tracking-widest` | 10px | Pipeline stage labels, column headers |
| Mono small | `text-[11px] font-mono` | 11px | Timestamps, IDs |

---

## Font Weights

| Weight | Tailwind Class | Usage |
|--------|---------------|-------|
| 400 | `font-normal` | Body text, descriptions |
| 500 | `font-medium` | Interactive elements, links, subtle emphasis |
| 600 | `font-semibold` | Headings, titles, button text |
| 700 | `font-bold` | Hero text, login title (rare) |

---

## Text Colors

See [tokens.md](./tokens.md) for the full color table. Quick reference:

| Hierarchy | Class | Usage |
|-----------|-------|-------|
| Primary | `text-foreground` | Main text, headings, active items |
| Secondary | `text-sensor` | Descriptions, metadata, inactive sidebar items |
| Tertiary | `text-dim` | Timestamps, disabled text, empty states |
| Muted | `text-muted-foreground` | Placeholder text, subtle labels |
| On primary | `text-primary-foreground` | Text on colored backgrounds |

---

## Line Heights

The app does not define custom line-height tokens. Tailwind defaults apply:

| Class | Line height | Typical pairing |
|-------|------------|-----------------|
| `leading-tight` | 1.25 | Headings |
| `leading-normal` | 1.5 | Body text |
| `leading-relaxed` | 1.625 | Long-form reading |
| (none) | inherits | Most UI text uses default |

The TipTap editor explicitly sets `line-height: 1.7` for comfortable reading.

---

## Letter Spacing

| Class | Usage |
|-------|-------|
| `tracking-wider` | Uppercase section labels |
| `tracking-widest` | Mono micro labels (`text-[10px] font-mono uppercase tracking-widest`) |
| (default) | All other text |

---

## Anti-aliasing

Applied globally in `index.css`:

```css
body {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```
