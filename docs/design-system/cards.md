# Cards & Containers

> Preview: open `preview.html#card` and `preview.html#stat-row` in a browser

**File:** `frontend/src/components/ui/card.tsx`

---

## Card Component

```tsx
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";

<Card>
  <CardHeader>
    <CardTitle>Channel Overview</CardTitle>
    <CardDescription>Manage settings and pipeline</CardDescription>
  </CardHeader>
  <CardContent>...</CardContent>
  <CardFooter>...</CardFooter>
</Card>
```

| Property | Value |
|----------|-------|
| Background | `bg-card` |
| Border | `border border-border` |
| Radius | `rounded-lg` (0 from `--radius`) |
| Padding | `p-6` (header, content, footer) |

---

## Section Container

The most common container pattern — used more than the Card component:

```tsx
<div className="rounded-xl border border-border bg-background overflow-hidden">
  {/* Content */}
</div>
```

---

## Stat Row

Horizontal metrics bar at the top of a page:

```tsx
<div className="rounded-xl overflow-hidden border border-border flex">
  {stats.map((stat, i) => (
    <div key={stat.label} className={cn("flex-1 px-5 py-4", i < stats.length - 1 && "border-r border-border")}>
      <p className="text-[10px] font-mono uppercase tracking-widest text-dim mb-1">{stat.label}</p>
      <p className="text-lg font-semibold text-foreground">{stat.value}</p>
    </div>
  ))}
</div>
```

| Element | Class |
|---------|-------|
| Container | `rounded-xl overflow-hidden border border-border flex` |
| Cell padding | `px-5 py-4` |
| Cell divider | `border-r border-border` (not on last) |
| Label | `text-[10px] font-mono uppercase tracking-widest text-dim` |
| Value | `text-lg font-semibold text-foreground` |

---

## Info Row (Key-Value)

Used inside panels and detail sections:

```tsx
<div className="flex items-center justify-between py-2.5 border-b border-border last:border-b-0">
  <span className="text-[12px] text-sensor">{label}</span>
  <span className="text-[13px] text-foreground">{value}</span>
</div>
```

---

## Detail Page Header

```tsx
<div className="rounded-xl border border-border bg-background overflow-hidden">
  <div className="relative aspect-video">
    <img src={thumbnail} className="w-full h-full object-cover" />
  </div>
  <div className="px-5 py-4">
    <h2 className="text-[15px] font-semibold text-foreground mb-1">{title}</h2>
    <p className="text-[12px] text-sensor">{subtitle}</p>
  </div>
</div>
```

---

## Upload Zone

```tsx
<div className="rounded-xl border border-dashed border-border py-16 flex flex-col items-center justify-center gap-3 text-center">
  <Upload className="w-8 h-8 text-dim" />
  <p className="text-[13px] text-dim">Drag files here or click to browse</p>
  <Button variant="outline" size="sm">Browse Files</Button>
</div>
```
