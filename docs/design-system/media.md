# Media Components

> Preview: open `preview.html#media` in a browser

**Files:** `carousel.tsx`, `chart.tsx`
**Built with:** Embla Carousel / Recharts + `cn()`

---

## Carousel

Horizontal or vertical slide-through content.

```tsx
import { Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext } from "@/components/ui/carousel";

<Carousel>
  <CarouselContent>
    <CarouselItem>Slide 1</CarouselItem>
    <CarouselItem>Slide 2</CarouselItem>
    <CarouselItem>Slide 3</CarouselItem>
  </CarouselContent>
  <CarouselPrevious />
  <CarouselNext />
</Carousel>
```

| Part | Class |
|------|-------|
| Root | `relative` |
| Content | `flex` (horizontal) / `flex-col` (vertical), `-ml-4` gap |
| Item | `min-w-0 shrink-0 grow-0 basis-full pl-4` |
| Prev/Next | `absolute h-8 w-8 rounded-full`, uses `Button` with `variant="outline" size="icon"` |

For partial slides, use `basis-1/2`, `basis-1/3`, etc. on `CarouselItem`.

---

## Chart

Wrapper around Recharts with Falak token integration.

```tsx
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartConfig } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis } from "recharts";

const config: ChartConfig = {
  views: { label: "Views", color: "hsl(var(--primary))" },
  likes: { label: "Likes", color: "hsl(var(--success))" },
};

<ChartContainer config={config}>
  <BarChart data={data}>
    <XAxis dataKey="date" />
    <YAxis />
    <Bar dataKey="views" fill="var(--color-views)" />
    <ChartTooltip content={<ChartTooltipContent />} />
  </BarChart>
</ChartContainer>
```

| Part | Class |
|------|-------|
| Container | `flex aspect-video justify-center text-xs` |
| Tooltip | `rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl` |
| Legend | `flex items-center justify-center gap-4` |

### ChartConfig

Maps data keys to labels and colors. Colors are injected as CSS variables:

```tsx
const config: ChartConfig = {
  views: { label: "Views", color: "hsl(var(--primary))" },
};
// Generates: --color-views: hsl(var(--primary))
```

### Tooltip Indicators

| Indicator | Look |
|-----------|------|
| `dot` | Small colored circle |
| `line` | Thin vertical bar |
| `dashed` | Dashed vertical bar |

---

## Tokens Used

| Token | Tailwind / CSS | Usage |
|-------|----------------|-------|
| `--border` | `border-border` | Tooltip border, axis lines |
| `--background` | `bg-background` | Tooltip background |
| `--muted-foreground` | `fill-muted-foreground` | Axis labels |
| `--muted` | `fill-muted` | Grid lines |
| `--color-{key}` | CSS variable | Series colors from `ChartConfig` |

---

## Rules

1. **Always use `ChartContainer`** — it injects CSS variables and applies token styling.
2. **Define colors in `ChartConfig`** using `hsl(var(--token))` format.
3. **Use `ChartTooltip` + `ChartTooltipContent`** for consistent tooltip styling.
4. **Carousel prev/next are button primitives.** They inherit button variants.
5. **Charts maintain `aspect-video`** by default. Override via `className` for custom sizes.
