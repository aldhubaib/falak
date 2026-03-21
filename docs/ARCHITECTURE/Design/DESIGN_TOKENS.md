# Falak Design Token Reference
> Single source of truth for the Falak design system.
> All tokens are defined in `frontend/src/index.css` (:root block).
> Tailwind aliases are in `tailwind.config.ts` (theme.extend).
> When asked to change a visual property, change the token value in index.css — it propagates everywhere.

---

## 1. Color Tokens

All color tokens use HSL channel values (no `hsl()` wrapper in the definition).
Use as: `hsl(var(--token-name))` in CSS, or `bg-token-name` / `text-token-name` in Tailwind.

### Surface Colors
| Token | Value | Tailwind class | Used for |
|---|---|---|---|
| `--background` | `240 4% 6%` | `bg-background` | App background, page base (53 files) |
| `--foreground` | `0 0% 93%` | `text-foreground` | Primary text (everywhere) |
| `--card` | `240 4% 6%` | `bg-card` | Card/panel backgrounds (35 files) |
| `--card-foreground` | `0 0% 93%` | `text-card-foreground` | Text inside cards |
| `--popover` | `0 0% 7%` | `bg-popover` | Dropdown/popover backgrounds |
| `--popover-foreground` | `0 0% 93%` | `text-popover-foreground` | Text inside popovers |
| `--secondary` | `0 0% 10%` | `bg-secondary` | Secondary surfaces |
| `--muted` | `0 0% 10%` | `bg-muted` | Muted/quiet backgrounds |
| `--muted-foreground` | `0 0% 45%` | `text-muted-foreground` | Subdued text |
| `--accent` | `0 0% 10%` | `bg-accent` | Accent surfaces |
| `--accent-foreground` | `0 0% 93%` | `text-accent-foreground` | Text on accent |
| `--elevated` | `0 0% 13%` | `bg-elevated` | Elevated surfaces (inputs, toolbars) |
| `--row-hover` | `0 0% 5%` | `bg-row-hover` | Table/list row hover state |
| `--dim` | `0 0% 40%` | `text-dim` | Dimmed/disabled text and icons |
| `--sensor` | `0 0% 60%` | `text-sensor` | Mid-level text (between muted and foreground) |

### Brand Colors
| Token | Value | Tailwind class | Used for |
|---|---|---|---|
| `--primary` | `217 72% 56%` | `bg-primary` / `text-primary` | Primary actions, focus rings |
| `--primary-foreground` | `0 0% 100%` | `text-primary-foreground` | Text on primary buttons |

### Status Colors
| Token | Value | Tailwind class | Used for |
|---|---|---|---|
| `--destructive` | `0 72% 51%` | `bg-destructive` / `text-destructive` | Errors, delete, failed states |
| `--destructive-foreground` | `0 0% 100%` | `text-destructive-foreground` | Text on destructive |
| `--success` | `142 50% 45%` | `bg-success` / `text-success` | Published, completed, success states |
| `--success-foreground` | `0 0% 100%` | `text-success-foreground` | Text on success |
| `--blue` | `217 72% 56%` | `bg-blue` / `text-blue` | Info, filming, in-progress states |
| `--blue-foreground` | `0 0% 100%` | `text-blue-foreground` | Text on blue |
| `--purple` | `258 60% 59%` | `bg-purple` / `text-purple` | Script, testing states |
| `--purple-foreground` | `0 0% 100%` | `text-purple-foreground` | Text on purple |
| `--orange` | `25 90% 55%` | `bg-orange` / `text-orange` | Warning, scripting states |
| `--orange-foreground` | `0 0% 100%` | `text-orange-foreground` | Text on orange |

### Border & Form Colors
| Token | Value | Tailwind class | Used for |
|---|---|---|---|
| `--border` | `228 8% 9%` | `border-border` | Default borders (50 files) |
| `--page-border` | `231 8% 9%` | `border-page-border` | Page-level dividers |
| `--input` | `0 0% 13%` | `border-input` | Input field borders |
| `--ring` | `217 72% 56%` | `ring-ring` | Focus rings on form elements |

### Sidebar Colors
| Token | Tailwind class | Used for |
|---|---|---|
| `--sidebar-background` | `bg-sidebar` | Sidebar panel background |
| `--sidebar-foreground` | `text-sidebar-foreground` | Sidebar text |
| `--sidebar-primary` | `bg-sidebar-primary` | Active sidebar item |
| `--sidebar-border` | `border-sidebar-border` | Sidebar dividers |

### Script Block Colors
> Defined in index.css, consumed only by `components/tiptap/ScriptBlock.tsx`.
> These reference the main token system — change the status colors above to affect these.

| Token | References | Used for |
|---|---|---|
| `--script-block-title` | `hsl(var(--orange))` | Title block label color |
| `--script-block-hook` | `hsl(var(--destructive))` | Hook block label color |
| `--script-block-hookStart` | `hsl(var(--purple))` | Hook start block label color |
| `--script-block-script` | `hsl(var(--blue))` | Script block label color |
| `--script-block-hookEnd` | `hsl(var(--purple))` | Hook end block label color |
| `--script-block-hashtags` | `hsl(var(--success))` | Hashtags block label color |

---

## 2. Radius Tokens

Defined in `index.css`, aliased in `tailwind.config.ts` under `theme.extend.borderRadius`.

| Token | Value | Tailwind class | Used for |
|---|---|---|---|
| `--radius-lg` | `0.5rem` | `rounded-lg` | **Default radius** — all boxes, cards, inputs, buttons, panels, form fields |
| `--radius-full` | `9999px` | `rounded-full` | **Pill/avatar radius** — all avatars, badges, icon buttons, progress bars |

**Rule:** Use `rounded-lg` for everything rectangular. Use `rounded-full` for pills, avatars, and badges.

---

## 3. Typography Tokens

Defined in `index.css`, aliased in `tailwind.config.ts` under `theme.extend.fontSize`.
This is Falak's real type scale (pixel-based, mapped to rem).

| Token | Value | px | Tailwind class | Used for |
|---|---|---|---|---|
| `--text-2xs` | `0.5625rem` | 9px | `text-2xs` | Metadata labels, chart axis ticks, progress %, avatar initials, overflow "+N" counts |
| `--text-xs` | `0.625rem` | 10px | `text-xs` | Section labels (uppercase+mono), stat counter labels, small action buttons |
| `--text-sm` | `0.6875rem` | 11px | `text-sm` | Sub-text, channel names, body content, panel headers, error messages |
| `--text-base` | `0.75rem` | 12px | `text-base` | Body paragraphs, table cells, tab filter buttons, dialog descriptions, metadata values |
| `--text-md` | `0.8125rem` | 13px | `text-md` | Section headings, sidebar nav items, primary body text, comments, transcript timestamps |
| `--text-lg` | `0.875rem` | 14px | `text-lg` | Form inputs, page sub-headings, dialog form fields |
| `--text-xl` | `0.9375rem` | 15px | `text-xl` | Dialog titles (`<DialogTitle>`), `<h2>` headings |
| `--text-2xl` | `1.125rem` | 18px | `text-2xl` | Avatar fallback initials |
| `--text-3xl` | `1.375rem` | 22px | `text-3xl` | Page headings (`<h1>`), e.g. "Choose your profile" |

**Font weight pattern:**
- `font-medium` → used nearly everywhere (56 files) — default weight
- `font-semibold` → section headings, card titles (36 files)
- `font-bold` → page-level headings only
- `font-mono` → all metadata labels, stat values, timestamps (36 files)

---

## 4. AI Writer Tokens

Defined in `index.css`. Used by the AI writing cursor and shimmer animation components.

| Token | Value | Used for |
|---|---|---|
| `--cursor-width` | `2px` | AI cursor width |
| `--cursor-height` | `0.95em` | AI cursor height |
| `--cursor-radius` | `1px` | AI cursor corner radius |
| `--cursor-color-idle` | `hsl(var(--dim))` | Cursor color when idle |
| `--cursor-color-thinking` | `hsl(var(--dim))` | Cursor color when thinking |
| `--cursor-color-writing` | `hsl(var(--foreground))` | Cursor color when writing |
| `--cursor-blink-idle` | `1.1s` | Blink speed when idle |
| `--cursor-blink-think` | `0.55s` | Blink speed when thinking |
| `--shimmer-base` | `hsl(var(--dim))` | Shimmer animation base color |
| `--shimmer-highlight` | `hsl(var(--foreground))` | Shimmer animation highlight color |
| `--shimmer-duration` | `1.8s` | Shimmer animation duration |
| `--shimmer-spread` | `2` | Shimmer spread multiplier |
| `--box-border` | `0.5px solid hsl(var(--border))` | Default box border (AI editor boxes) |
| `--box-border-active` | `1px solid hsl(var(--blue))` | Active/focused box border |
| `--box-radius` | `0.5rem` | Box corner radius (matches --radius-lg) |
| `--dot-size` | `5px` | Pulse dot size |
| `--dot-pulse-duration` | `0.55s` | Pulse dot animation duration |

---

## 5. How to use this with Cursor

When asking Cursor to make a visual change, always reference the token name, not a raw value.

**Examples:**

> "Change all card backgrounds to be slightly lighter"
> → Edit `--card` in `index.css`

> "Make all section cards have sharper corners"
> → Edit `--radius-xl` in `index.css`

> "Increase the body text size across the app"
> → Edit `--text-base` in `index.css`

> "Make the success color more vivid"
> → Edit `--success` in `index.css`

> "The script block title color should match the orange status color"
> → Already done — `--script-block-title` references `hsl(var(--orange))`

**File locations:**
- All token definitions: `frontend/src/index.css` (`:root` block, lines ~9–89)
- Radius definitions: `frontend/src/index.css` lines 51–57
- Typography definitions: `frontend/src/index.css` lines 59–68
- Tailwind aliases: `frontend/tailwind.config.ts` lines 20–93

---

## 6. What is NOT tokenized (known hardcoded values)

These are intentional or edge-case values that don't need tokens:

| Location | Value | Reason |
|---|---|---|
| `components/ui/calendar.tsx` | `text-[0.8rem]` | shadcn/ui internal, don't touch |
| `components/ui/scroll-area.tsx` | `rounded-[inherit]` | shadcn/ui internal, don't touch |
| `components/ui/chart.tsx` | `rounded-[2px]` | Recharts-specific, intentional |
| Various layout files | `w-[180px]`, `h-[120px]`, `max-w-[800px]` etc. | Layout-specific fixed dimensions, intentional |
| `pages/Login.tsx` | `aspect-[9/16]` | Fixed video aspect ratio, intentional |
