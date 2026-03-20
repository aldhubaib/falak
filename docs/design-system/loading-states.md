# Loading & Empty States

> Preview: open `preview.html#loading-empty` in a browser

**Icon:** `Loader2` from `lucide-react`
**Component:** `Skeleton` from `@/components/ui/skeleton`
**Error:** `PageError` from `@/components/PageError`

---

## Loading Spinner

Use `Loader2` from Lucide everywhere. Not CSS spinners.

### Page-Level

```tsx
<div className="flex items-center justify-center h-64">
  <Loader2 className="w-6 h-6 animate-spin text-dim" />
</div>
```

### With Message

```tsx
<div className="flex flex-col items-center justify-center h-64 gap-3">
  <Loader2 className="w-6 h-6 animate-spin text-dim" />
  <p className="text-[13px] text-dim">Loading channel data…</p>
</div>
```

### Inline (Buttons)

```tsx
<Button disabled={loading}>
  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
  {loading ? "Saving..." : "Save"}
</Button>
```

### Sizes

| Context | Size |
|---------|------|
| Page-level | `w-6 h-6` |
| Section-level | `w-5 h-5` |
| Inline (buttons, cells) | `w-4 h-4` |

---

## Skeleton Loading

```tsx
<div className="space-y-3">
  <Skeleton className="h-4 w-48" />
  <Skeleton className="h-4 w-full" />
  <Skeleton className="h-4 w-3/4" />
</div>
```

Skeleton: `rounded-md bg-muted animate-pulse`

---

## Empty States

### Standard

```tsx
<div className="flex flex-col items-center justify-center py-12 text-center">
  <ImageIcon className="w-10 h-10 text-dim/50 mb-3" />
  <p className="text-[13px] text-dim font-mono">No items found</p>
</div>
```

### With Action

```tsx
<div className="flex flex-col items-center justify-center py-12 text-center">
  <ImageIcon className="w-10 h-10 text-dim/50 mb-3" />
  <p className="text-[13px] text-dim mb-4">No media found</p>
  <Button variant="outline" size="sm">Upload Media</Button>
</div>
```

### Rules

1. **Always show an empty state** — never leave blank space.
2. **Use an icon** when the empty area is large.
3. **Offer an action** when the user can fix the empty state.
4. **Text style**: `text-[13px] text-dim`, optionally `font-mono`.

---

## Error States

### Page-Level

```tsx
<PageError title="Something went wrong" message="Could not load channel data." />
```

### Inline

```tsx
<div className="flex items-center gap-2 text-destructive text-[13px]">
  <AlertTriangle className="w-4 h-4" />
  <span>Failed to load data</span>
</div>
```

### With Retry

```tsx
<div className="flex flex-col items-center justify-center py-12 gap-3">
  <AlertTriangle className="w-8 h-8 text-destructive" />
  <p className="text-[13px] text-dim">Something went wrong</p>
  <Button variant="outline" size="sm" onClick={retry}>Try Again</Button>
</div>
```
