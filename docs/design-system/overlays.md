# Overlays (Tooltip, Popover, Hover Card)

> Preview: open `preview.html#overlays` in a browser

**Files:** `tooltip.tsx`, `popover.tsx`, `hover-card.tsx`
**Built with:** Radix primitives + `cn()`

---

## Tooltip

Small text label on hover. **Mandatory on every icon button.**

```tsx
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";

<TooltipProvider>
  <Tooltip>
    <TooltipTrigger asChild>
      <button className="icon-btn">
        <RefreshCw className="w-3.5 h-3.5" />
      </button>
    </TooltipTrigger>
    <TooltipContent>Sync channel</TooltipContent>
  </Tooltip>
</TooltipProvider>
```

| Property | Value |
|----------|-------|
| Padding | `px-3 py-1.5` |
| Font | `text-sm` |
| Offset | `sideOffset={4}` |
| Animation | `animate-in fade-in-0 zoom-in-95` |

---

## Popover

Floating panel with arbitrary content. Triggered by click.

```tsx
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";

<Popover>
  <PopoverTrigger asChild>
    <Button variant="outline" size="sm">Filters</Button>
  </PopoverTrigger>
  <PopoverContent className="w-80">
    {/* Filter form, date pickers, etc. */}
  </PopoverContent>
</Popover>
```

| Property | Value |
|----------|-------|
| Default width | `w-72` |
| Padding | `p-4` |
| Offset | `sideOffset={4}` |

---

## Hover Card

Rich preview on hover. Use for link previews, user cards.

```tsx
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";

<HoverCard>
  <HoverCardTrigger asChild>
    <a href="/channel/123">@TechChannel</a>
  </HoverCardTrigger>
  <HoverCardContent className="w-80">
    <div className="flex gap-4">
      <Avatar>...</Avatar>
      <div>
        <p className="text-sm font-semibold">TechChannel</p>
        <p className="text-xs text-muted-foreground">1.2M subscribers</p>
      </div>
    </div>
  </HoverCardContent>
</HoverCard>
```

| Property | Value |
|----------|-------|
| Default width | `w-64` |
| Padding | `p-4` |

---

## Shared Styling

All three share the same surface tokens:

| Part | Class |
|------|-------|
| Content bg | `bg-popover text-popover-foreground` |
| Border | `border rounded-md` |
| Shadow | `shadow-md` |
| Animation | `animate-in fade-in-0 zoom-in-95` + directional `slide-in-from-*` |

---

## Tokens Used

| Token | Tailwind | Usage |
|-------|----------|-------|
| `--popover` | `bg-popover` | Content background |
| `--popover-foreground` | `text-popover-foreground` | Content text |
| `--border` | `border` | Content border |

---

## Rules

1. **Tooltip for icon buttons — always.** No exceptions. See [buttons.md](./buttons.md).
2. **Popover for interactive content** (forms, selectors, filters).
3. **HoverCard for passive previews** (no interactive elements inside).
4. **Never nest Popovers.** Use a Dialog if content is complex.
5. **`TooltipProvider` must wrap the app.** Already in `App.tsx`.
6. **Use `asChild`** on triggers to avoid extra DOM nodes.
