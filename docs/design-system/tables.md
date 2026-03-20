# Tables

> Preview: open `preview.html#table` in a browser

**Primitive:** `frontend/src/components/ui/table.tsx`
**App composite:** `frontend/src/components/VideoTable.tsx`

---

## Structure

```tsx
<div className="rounded-xl overflow-hidden border border-border">
  {/* Header */}
  <div className="grid grid-cols-[1fr_100px_100px_160px] px-4 py-2.5 text-[10px] font-mono uppercase tracking-widest text-dim border-b border-border">
    <span>Name</span>
    <span>Status</span>
    <span>Views</span>
    <span>Date</span>
  </div>

  {/* Rows */}
  {items.map(item => (
    <div
      key={item.id}
      className="grid grid-cols-[1fr_100px_100px_160px] px-4 py-3 border-b border-border last:border-b-0 hover:bg-rowHover transition-colors cursor-pointer"
    >
      <span className="text-[13px] text-foreground truncate">{item.name}</span>
      <span className="text-[12px] text-sensor">{item.status}</span>
      <span className="text-[12px] text-sensor">{item.views}</span>
      <span className="text-[12px] text-dim">{item.date}</span>
    </div>
  ))}
</div>
```

---

## Style Reference

| Element | Class |
|---------|-------|
| Container | `rounded-xl overflow-hidden border border-border` |
| Header text | `text-[10px] font-mono uppercase tracking-widest text-dim` |
| Header padding | `px-4 py-2.5` |
| Row padding | `px-4 py-3` |
| Row hover | `hover:bg-rowHover` |
| Row divider | `border-b border-border last:border-b-0` |
| Cell primary | `text-[13px] text-foreground` |
| Cell secondary | `text-[12px] text-sensor` |
| Cell tertiary | `text-[12px] text-dim` |

---

## Empty State

```tsx
<div className="text-center py-8">
  <p className="text-[13px] text-dim">No videos yet</p>
</div>
```

---

## Tokens Used

| Token | Usage |
|-------|-------|
| `--border` | Container border, row dividers |
| `--row-hover` | Row hover background |
| `--foreground` | Primary cell text |
| `--sensor` | Secondary cell text |
| `--dim` | Tertiary cell text, header text |

---

## Rules

1. **Always use `hover:bg-rowHover`** — never hardcode `bg-[#0d0d10]`.
2. **Always use `border-border`** — never hardcode `border-[#151619]`.
3. **Always include an empty state.**
4. **Header is mono uppercase** — `text-[10px] font-mono uppercase tracking-widest`.
