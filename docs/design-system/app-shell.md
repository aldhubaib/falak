# App Shell

> Preview: open `preview.html#page-layout` in a browser

**Files:** `AppLayout.tsx`, `AppSidebar.tsx`, `ChannelLayout.tsx`

---

## Structure

Every authenticated page sits inside `AppLayout`:

```
┌─────────┬────────────────────────────────────────┐
│         │  Top Bar (h-12)                         │
│ Sidebar │──────────────────────────────────────── │
│         │  Content Area (px-6 max-lg:px-4)        │
│         │                                         │
└─────────┴────────────────────────────────────────┘
```

Standalone pages (Login, ProfilePicker, Index) render **outside** the shell — no sidebar.

---

## Top Bar

```tsx
<div className="h-12 flex items-center gap-3 px-6 max-lg:px-4 border-b border-border shrink-0">
  <h1 className="text-sm font-semibold text-foreground">Page Title</h1>
  <div className="flex-1" />
  {/* Action buttons */}
</div>
```

| Property | Value |
|----------|-------|
| Height | `h-12` (48px) |
| Padding | `px-6 max-lg:px-4` |
| Border | `border-b border-border` |
| Title | `text-sm font-semibold` |
| Actions | Right-aligned via `flex-1` spacer |

---

## Content Area

```tsx
<div className="flex-1 overflow-auto">
  <div className="px-6 pt-5 pb-8 max-lg:px-4">
    {/* Page content */}
  </div>
</div>
```

| Property | Value |
|----------|-------|
| Horizontal padding | `px-6 max-lg:px-4` |
| Top padding | `pt-5` |
| Bottom padding | `pb-8` |

---

## Section Spacing

| Between | Class |
|---------|-------|
| Major sections | `mb-5` or `space-y-5` |
| Section header → content | `mb-3` |
| Items in a list | `space-y-3` or `gap-3` |

---

## Detail Pages

Detail pages (VideoDetail, StoryDetail, ArticleDetail) follow a two-zone pattern:

1. **Top bar** with back navigation + actions
2. **Scrollable content** with hero/header card + sections

Some have a **right panel overlay** that slides in:

```tsx
<div className="fixed inset-y-0 right-0 w-[380px] bg-background border-l border-border z-50 overflow-y-auto">
  <div className="flex items-center justify-between px-5 py-4 border-b border-border">
    <h2 className="text-sm font-semibold">Panel Title</h2>
    <Button variant="ghost" size="icon" onClick={onClose}>
      <X className="w-4 h-4" />
    </Button>
  </div>
  <div className="px-5 py-4 space-y-4">...</div>
</div>
```

---

## Responsive Breakpoints

| Breakpoint | Prefix | Usage |
|-----------|--------|-------|
| < 1024px | `max-lg:` | Reduce padding to `px-4` |
| < 640px | `max-sm:` | Further reduce to `px-3`, stack layouts |
| < 768px | `md:` | Grid column adjustments |

Sidebar collapses on mobile → hamburger menu → drawer.

---

## Grids

```tsx
// Album / card grid
<div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">

// Data table grid
<div className="grid grid-cols-[1fr_70px_110px_110px_100px]">
```
