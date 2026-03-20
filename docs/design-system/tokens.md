# Design Tokens

> Source of truth: `frontend/src/index.css` `:root` block
> Tailwind mapping: `frontend/tailwind.config.ts`

All tokens are defined as space-separated HSL values (e.g. `258 60% 59%`) and consumed as `hsl(var(--token))` in the Tailwind config. This means you use Tailwind classes like `bg-primary` and they resolve to the CSS variable automatically.

> Open `preview.html` in a browser to see these tokens rendered. Sections: #colors, #surfaces, #text-colors, #borders, #spacing

---

## Color Palette

### Core Surfaces

| Token | CSS Variable | Tailwind Class | HSL Value | Usage |
|-------|-------------|----------------|-----------|-------|
| Background | `--background` | `bg-background` | `240 4% 6%` | Page background |
| Card | `--card` | `bg-card` | `0 0% 7%` | Card surfaces, containers, panels |
| Elevated | `--elevated` | `bg-elevated` | `0 0% 13%` | Highest elevation surfaces |
| Popover | `--popover` | `bg-popover` | `0 0% 7%` | Popover/dropdown backgrounds (same as card) |

### Text Colors

| Token | CSS Variable | Tailwind Class | HSL Value | Usage |
|-------|-------------|----------------|-----------|-------|
| Foreground | `--foreground` | `text-foreground` | `0 0% 93%` | Primary text |
| Sensor | `--sensor` | `text-sensor` | `0 0% 60%` | Secondary text |
| Dim | `--dim` | `text-dim` | `0 0% 40%` | Tertiary / disabled text |
| Muted fg | `--muted-foreground` | `text-muted-foreground` | `0 0% 45%` | Muted text (similar to dim) |

### Accent Colors

| Token | CSS Variable | Tailwind Class | HSL Value | Usage |
|-------|-------------|----------------|-----------|-------|
| Primary | `--primary` | `bg-primary` / `text-primary` | `258 60% 59%` | Primary actions, focus rings, links |
| Blue | `--blue` | `bg-blue` / `text-blue` | `217 72% 56%` | Blue accent, AI writer active border |
| Purple | `--purple` | `bg-purple` / `text-purple` | `258 60% 59%` | Purple accent (same as primary) |
| Orange | `--orange` | `bg-orange` / `text-orange` | `25 90% 55%` | Orange accent, warnings |

### Status Colors

| Token | CSS Variable | Tailwind Class | HSL Value | Usage |
|-------|-------------|----------------|-----------|-------|
| Destructive | `--destructive` | `bg-destructive` / `text-destructive` | `0 72% 51%` | Error, danger, delete |
| Success | `--success` | `bg-success` / `text-success` | `142 50% 45%` | Success states |

### Interactive

| Token | CSS Variable | Tailwind Class | HSL Value | Usage |
|-------|-------------|----------------|-----------|-------|
| Secondary | `--secondary` | `bg-secondary` | `0 0% 10%` | Secondary buttons, surfaces |
| Accent | `--accent` | `bg-accent` | `0 0% 10%` | Hover/focus backgrounds (same as secondary) |
| Muted | `--muted` | `bg-muted` | `0 0% 10%` | Muted backgrounds (same as secondary) |
| Input | `--input` | `bg-input` | `0 0% 12%` | Input field backgrounds |
| Row Hover | `--row-hover` | `bg-rowHover` | `0 0% 5%` | Table/list row hover |

### Borders

| Token | CSS Variable | Tailwind Class | HSL Value | Usage |
|-------|-------------|----------------|-----------|-------|
| Border | `--border` | `border-border` | `230 7% 9%` | Default border color |
| Page Border | `--page-border` | `border-pageBorder` | `231 8% 9%` | Page chrome borders |
| Ring | `--ring` | `ring-ring` | `258 60% 59%` | Focus ring (matches primary) |

### Sidebar

| Token | CSS Variable | Tailwind Class | HSL Value |
|-------|-------------|----------------|-----------|
| Sidebar bg | `--sidebar-background` | `bg-sidebar` | `0 0% 4%` |
| Sidebar fg | `--sidebar-foreground` | `text-sidebar-foreground` | `0 0% 45%` |
| Sidebar primary | `--sidebar-primary` | `text-sidebar-primary` | `258 60% 59%` |
| Sidebar accent | `--sidebar-accent` | `bg-sidebar-accent` | `0 0% 10%` |
| Sidebar border | `--sidebar-border` | `border-sidebar-border` | `0 0% 12%` |

---

## Border Radius

```css
--radius: 0rem;
```

Tailwind classes `rounded-sm`, `rounded-md`, `rounded-lg` all resolve to `0rem` or negative (effectively 0). The app is **sharp-cornered by default**.

Where rounding is used, it is applied explicitly:

| Usage | Class | Resulting radius |
|-------|-------|-----------------|
| Cards, containers, sections | `rounded-xl` | `0.75rem` (12px) |
| Buttons, inputs, badges | `rounded-md` via component | 0rem (sharp) |
| Pill filters, tags | `rounded-full` | fully rounded |
| Avatar | `rounded-full` | circle |
| Dialogs | `rounded-xl` | 12px |

---

## Spacing Scale

Tailwind's default spacing scale is used. Common values in the app:

| Token | Value | Common usage |
|-------|-------|-------------|
| `1` | `0.25rem` (4px) | Tight gaps |
| `1.5` | `0.375rem` (6px) | Icon gaps |
| `2` | `0.5rem` (8px) | Small gaps, small padding |
| `2.5` | `0.625rem` (10px) | Input padding |
| `3` | `0.75rem` (12px) | Section gaps |
| `4` | `1rem` (16px) | Content gaps, medium padding |
| `5` | `1.25rem` (20px) | Section spacing |
| `6` | `1.5rem` (24px) | Page padding, card padding |
| `8` | `2rem` (32px) | Large spacing |

---

## How to Change a Token

1. Edit the HSL value in `frontend/src/index.css` under `:root`.
2. Every Tailwind class referencing that token updates automatically.
3. If adding a **new** token:
   - Add the CSS variable to `:root` in `index.css`.
   - Add the Tailwind mapping in `tailwind.config.ts` under `theme.extend.colors`.
   - Use the new class in components.
4. **Never** use hardcoded hex/rgb/hsl values in component files.

---

## Foreground Pairs

Every surface token has a matching `-foreground` token for text on that surface:

| Surface | Text on it |
|---------|-----------|
| `bg-primary` | `text-primary-foreground` (white) |
| `bg-destructive` | `text-destructive-foreground` (white) |
| `bg-secondary` | `text-secondary-foreground` |
| `bg-card` | `text-card-foreground` |
| `bg-popover` | `text-popover-foreground` |
| `bg-success` | `text-success-foreground` (white) |
| `bg-blue` | `text-blue-foreground` (white) |
| `bg-purple` | `text-purple-foreground` (white) |
| `bg-orange` | `text-orange-foreground` (white) |
