# Layout Utilities

> Preview: open `preview.html#layout-utilities` in a browser

**Files:** `separator.tsx`, `scroll-area.tsx`, `resizable.tsx`, `aspect-ratio.tsx`
**Built with:** Radix primitives + `cn()`

---

## Separator

Visual divider between sections.

```tsx
import { Separator } from "@/components/ui/separator";

<Separator />                           {/* horizontal, full width */}
<Separator orientation="vertical" />    {/* vertical, full height */}
```

| Orientation | Class |
|-------------|-------|
| Horizontal | `h-[1px] w-full bg-border` |
| Vertical | `h-full w-[1px] bg-border` |

---

## Scroll Area

Custom scrollbar overlay that replaces native scrollbars.

```tsx
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

<ScrollArea className="h-72 w-48 rounded-md border">
  <div className="p-4">{/* long content */}</div>
  <ScrollBar orientation="vertical" />
</ScrollArea>
```

| Part | Class |
|------|-------|
| Root | `relative overflow-hidden` |
| Viewport | `h-full w-full rounded-[inherit]` |
| Scrollbar (vertical) | `w-2.5 border-l border-l-transparent` |
| Scrollbar (horizontal) | `h-2.5 border-t border-t-transparent` |
| Thumb | `rounded-full bg-border` |

---

## Resizable Panels

Split-pane layout with draggable handles.

```tsx
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";

<ResizablePanelGroup direction="horizontal">
  <ResizablePanel defaultSize={50}>Left</ResizablePanel>
  <ResizableHandle withHandle />
  <ResizablePanel defaultSize={50}>Right</ResizablePanel>
</ResizablePanelGroup>
```

| Part | Class |
|------|-------|
| Group | `flex h-full w-full` (vertical: `flex-col`) |
| Handle | `w-px bg-border` (horizontal), `h-px` (vertical) |
| Grip icon | `rounded-sm border bg-border` (when `withHandle`) |

---

## Aspect Ratio

Constrains children to a given aspect ratio.

```tsx
import { AspectRatio } from "@/components/ui/aspect-ratio";

<AspectRatio ratio={16 / 9}>
  <img src={thumbnail} className="h-full w-full rounded-md object-cover" />
</AspectRatio>
```

Common ratios used in Falak:

| Ratio | Use |
|-------|-----|
| `16/9` | Video thumbnails, video players |
| `9/16` | Short (vertical) video preview |
| `4/3` | Album cover cards |

---

## Tokens Used

| Token | Tailwind | Usage |
|-------|----------|-------|
| `--border` | `bg-border` | Separator, scrollbar thumb, resize handle |
| `--ring` | `ring-ring` | Resize handle focus |

---

## Rules

1. **Use Separator, not raw `<hr>` or border-b divs.**
2. **ScrollArea for any scrollable container** with custom styling needs.
3. **ResizableHandle `withHandle`** shows a visible grip. Omit for invisible handles.
4. **AspectRatio for thumbnails** — always `16/9` for videos, `9/16` for shorts.
