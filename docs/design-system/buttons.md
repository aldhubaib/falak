# Buttons

> Preview: open `preview.html#buttons` in a browser

**File:** `frontend/src/components/ui/button.tsx`
**Built with:** Radix Slot + `cva` + `cn()`

---

## Text Buttons (with label)

Used for primary actions where the label needs to be visible.

| Variant | Look | When to Use |
|---------|------|-------------|
| `default` | Purple background | Primary actions (Save, Create, Publish) |
| `destructive` | Red background | Destructive text actions (in dialogs, forms) |
| `outline` | Border only | Secondary actions (Cancel, Re-evaluate) |
| `secondary` | Dark background | Tertiary actions |
| `ghost` | Transparent | Subtle text triggers |
| `link` | Underline | Text links styled as buttons |

| Size | Dimensions | When to Use |
|------|-----------|-------------|
| `default` | `h-10 px-4 py-2` | Standard buttons |
| `sm` | `h-9 px-3` | Compact, top bar actions |
| `lg` | `h-11 px-8` | Prominent CTAs |

```tsx
<Button>Save Changes</Button>
<Button variant="destructive" size="sm">Delete</Button>
<Button variant="outline">Cancel</Button>
```

---

## Icon Action Buttons

The primary button pattern for inline actions. **Icon only, no text.** Circular secondary background on hover. Tooltip on hover explains what the button does.

### Style

| Property | Value |
|----------|-------|
| Shape | `rounded-full` (circle) |
| Size | `w-7 h-7` (card actions), `w-10 h-10` (panel actions) |
| Resting | `bg-transparent text-dim` |
| Normal hover | `bg-secondary text-foreground` (icon turns white) |
| Attention hover | `bg-secondary text-destructive` (icon turns red) |

### Code

```tsx
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

<Tooltip>
  <TooltipTrigger asChild>
    <button className="w-7 h-7 rounded-full flex items-center justify-center text-dim hover:text-foreground hover:bg-secondary transition-colors">
      <RefreshCw className="w-3.5 h-3.5" />
    </button>
  </TooltipTrigger>
  <TooltipContent>Sync channel</TooltipContent>
</Tooltip>
```

### Destructive Icon Button

```tsx
<Tooltip>
  <TooltipTrigger asChild>
    <button className="w-7 h-7 rounded-full flex items-center justify-center text-dim hover:text-destructive hover:bg-secondary transition-colors">
      <X className="w-3.5 h-3.5" />
    </button>
  </TooltipTrigger>
  <TooltipContent>Remove channel</TooltipContent>
</Tooltip>
```

### Primary Icon Button

```tsx
<Tooltip>
  <TooltipTrigger asChild>
    <button className="w-10 h-10 rounded-full flex items-center justify-center text-dim hover:text-primary hover:bg-secondary transition-colors">
      <Play className="w-4 h-4" />
    </button>
  </TooltipTrigger>
  <TooltipContent>Analyze all</TooltipContent>
</Tooltip>
```

---

## Loading State

```tsx
<Button disabled={loading}>
  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
  {loading ? "Saving..." : "Save"}
</Button>
```

---

## Tokens Used

| Token | Tailwind | Usage |
|-------|----------|-------|
| `--primary` | `bg-primary` | Default text button bg, primary icon hover |
| `--destructive` | `bg-destructive` | Destructive text button bg, destructive icon hover |
| `--secondary` | `bg-secondary` | Icon button hover bg |
| `--elevated` | `bg-elevated` | Alternate icon button hover bg |
| `--dim` | `text-dim` | Icon button resting color |
| `--foreground` | `text-foreground` | Icon button hover color |
| `--border` | `border-border` | Outline text button border |

---

## Rules

1. **One primary action per section.** Don't put two `default` buttons side by side.
2. **Destructive actions need confirmation.** Pair with `AlertDialog`.
3. **Icon buttons are always icon-only** — no text label. Tooltip handles the label.
4. **Every icon button gets a `<Tooltip>`** — this is mandatory, no exceptions.
5. **Use `asChild` with Radix Slot** when wrapping a router `<Link>`.
6. **Never use native `title=""`** — always use the shadcn `Tooltip` component.
