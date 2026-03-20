# Progress

> Preview: open `preview.html#progress` in a browser

---

## Circular Progress Ring

Circular rings with the percentage and label centered inside. Track is `--secondary`, fill stroke color varies by type.

### Style

| Property | Value |
|----------|-------|
| Size | `120px` (w/h) |
| Track | `stroke: var(--secondary)`, `stroke-width: 8` |
| Fill | `stroke-width: 8`, `stroke-linecap: round` |
| Label | `text-[9px] font-mono uppercase tracking-widest text-dim` |
| Value | `text-2xl font-bold text-foreground` |

### Color by Type

| Score | Stroke Color |
|-------|-------------|
| Relevance | `var(--primary)` (purple) |
| Virality | `var(--blue)` |
| First Mover | `var(--success)` (green) |
| Processing | `var(--orange)` |

### Code

```tsx
<div className="relative w-[120px] h-[120px]">
  <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
    <circle cx="60" cy="60" r="50" fill="none" className="stroke-secondary" strokeWidth="8" />
    <circle cx="60" cy="60" r="50" fill="none"
      className="stroke-primary" strokeWidth="8" strokeLinecap="round"
      strokeDasharray="314.16"
      strokeDashoffset={314.16 * (1 - value / 100)}
    />
  </svg>
  <div className="absolute inset-0 flex flex-col items-center justify-center">
    <span className="text-[9px] font-mono uppercase tracking-widest text-dim">{label}</span>
    <span className="text-2xl font-bold text-foreground">{value}%</span>
  </div>
</div>
```

### Calculation

`strokeDashoffset = circumference × (1 - percentage / 100)`

Where `circumference = 2 × π × r = 2 × 3.1416 × 50 = 314.16`

---

## Tokens Used

| Token | Usage |
|-------|-------|
| `--secondary` | Track background |
| `--primary` | Purple fill |
| `--blue` | Blue fill |
| `--success` | Green fill |
| `--orange` | Orange fill |
| `--dim` | Center label text |
| `--foreground` | Center value text |
