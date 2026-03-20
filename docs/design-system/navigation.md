# Navigation — Pills & Tabs

> Preview: open `preview.html#filter-pills` in a browser

---

## Filter Pills

Horizontal filter row (Stories, PublishQueue, Pipeline):

```tsx
<div className="flex gap-2">
  {filters.map(filter => (
    <button
      key={filter.value}
      onClick={() => setActive(filter.value)}
      className={cn(
        "px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors",
        active === filter.value
          ? "bg-foreground text-background"
          : "text-dim hover:text-foreground"
      )}
    >
      {filter.label}
      {filter.count != null && (
        <span className="ml-1.5 text-sensor">{filter.count}</span>
      )}
    </button>
  ))}
</div>
```

| State | Style |
|-------|-------|
| Active | `bg-foreground text-background` (white pill, dark text) |
| Inactive | `text-dim hover:text-foreground` |
| Shape | `rounded-full` |
| Size | `px-3 py-1.5 text-[12px]` |

---

## Tab Bar

Horizontal tabs with bottom indicator (Pipeline, Gallery, Analytics):

```tsx
<div className="flex border-b border-border">
  {tabs.map(tab => (
    <button
      key={tab.value}
      onClick={() => setActive(tab.value)}
      className={cn(
        "px-4 py-3 text-[13px] font-medium transition-colors border-b-2 -mb-px",
        active === tab.value
          ? "border-primary text-foreground"
          : "border-transparent text-dim hover:text-foreground"
      )}
    >
      {tab.label}
    </button>
  ))}
</div>
```

| State | Style |
|-------|-------|
| Active | `border-primary text-foreground` |
| Inactive | `border-transparent text-dim` |
| Indicator | `border-b-2` on the button, `-mb-px` to overlap container border |

---

## Link Styles

Defined in `index.css`:

| Class | Behavior |
|-------|----------|
| `.link` | `text-foreground` → `text-sensor` on hover |
| `.link-external` | Same + underline on hover |

```tsx
<a href={url} className="link">Internal Link</a>
<a href={url} target="_blank" rel="noopener" className="link-external">External Link</a>
```
