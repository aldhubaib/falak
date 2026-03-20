# Falak Design Language System

> Single source of truth for every visual decision in the Falak app.
> Reference these docs when asking the AI to build or change UI.

## Philosophy

- **Dark-only.** Single dark theme. No light mode.
- **Token-driven.** Every color, radius, and font is a CSS variable consumed via Tailwind. Change a token once → it updates everywhere.
- **shadcn/ui primitives.** We use shadcn/ui on top of Radix UI. Never build a primitive from scratch when one exists.
- **Utility-first.** Tailwind classes via `cn()` (clsx + tailwind-merge). No CSS modules, no styled-components, no inline `style` objects.
- **Sharp geometry.** `--radius: 0rem` — corners are sharp by default. Intentional rounding uses `rounded-xl` for cards/containers.

## Visual Preview

Open `docs/design-system/preview.html` in a browser to see every element rendered with the actual tokens:

```bash
cd docs/design-system && python3 -m http.server 8787
# then open http://localhost:8787/preview.html
```

Each doc below references which `preview.html#section` to jump to.

---

## Element Docs

| Doc | What It Covers |
|-----|----------------|
| [app-shell.md](./app-shell.md) | Page shell, top bar, content area, side panels, grids, responsive |
| [buttons.md](./buttons.md) | Variants, sizes, loading state, rules |
| [badges.md](./badges.md) | Variants, status colors, usage rules |
| [tables.md](./tables.md) | Structure, header, rows, hover, empty state |
| [cards.md](./cards.md) | Card component, section containers, stat row, info row, upload zone |
| [dialogs.md](./dialogs.md) | Dialog, AlertDialog, Sheet, Drawer, confirmation rules |
| [inputs.md](./inputs.md) | Input, Textarea, Select, Checkbox, Switch, validation, field layout |
| [toasts.md](./toasts.md) | Sonner variants, wording guidelines |
| [loading-states.md](./loading-states.md) | Spinners, skeletons, empty states, error states |
| [progress.md](./progress.md) | Progress bars, score bars |
| [navigation.md](./navigation.md) | Filter pills, tab bar, link styles |

## Foundation Docs

| Doc | What It Covers |
|-----|----------------|
| [tokens.md](./tokens.md) | Colors, surfaces, borders, radius, spacing scale |
| [typography.md](./typography.md) | Fonts, type scale, weights, line-heights |
| [INCONSISTENCIES.md](./INCONSISTENCIES.md) | Audit of current inconsistencies that need unification |

---

## Key Source Files

| Purpose | Path |
|---------|------|
| Design tokens (CSS variables) | `frontend/src/index.css` `:root` block |
| Tailwind config (maps tokens) | `frontend/tailwind.config.ts` |
| Class merge utility | `frontend/src/lib/utils.ts` → `cn()` |
| shadcn config | `frontend/components.json` |
| UI primitives | `frontend/src/components/ui/*.tsx` |
| App composites | `frontend/src/components/*.tsx` |
| Pages | `frontend/src/pages/*.tsx` |

## Rules for AI

1. **Never hardcode colors.** Use token classes (`bg-primary`, `text-foreground`, `border-border`). If a token is missing, add it to `index.css` and `tailwind.config.ts` first.
2. **Never build primitives from scratch.** Check `components/ui/` first.
3. **Always use `cn()`** from `@/lib/utils` for class composition.
4. **Follow the layout shell.** Every page sits inside `AppLayout` with a `h-12` top bar and `px-6 max-lg:px-4` content area.
5. **Use Lucide icons only.** Import from `lucide-react`.
6. **Use sonner for toasts.** `toast.success()`, `toast.error()`, `toast.info()`. No plain `toast()`.
7. **Use AlertDialog for destructive confirmations.** Never `window.confirm()`.
