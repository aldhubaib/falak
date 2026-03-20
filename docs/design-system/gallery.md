# Gallery

> Preview: open `preview.html#gallery` in a browser

**Files:** `gallery/AlbumCard.tsx`, `gallery/MediaGrid.tsx`, `gallery/MediaViewer.tsx`

---

## Album Card

Card linking to an album with cover image, name, and count.

```tsx
<div className="rounded-xl bg-background hover:bg-card">
  <div className="aspect-[4/3] bg-elevated overflow-hidden">
    <img className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform" />
    <div className="bg-gradient-to-t from-black/40 to-transparent" />
  </div>
  <div className="p-3">
    <p className="text-[13px] font-medium">{name}</p>
    <p className="text-[11px] text-dim font-mono">{count} items</p>
  </div>
</div>
```

| Property | Value |
|----------|-------|
| Aspect | `4:3` |
| Hover | Image scales `1.03`, card bg shifts |
| Overlay | Gradient `from-black/40 to-transparent` |

---

## Media Grid

Photo-album-style rows layout using `react-photo-album`.

| Property | Value |
|----------|-------|
| Row height | `targetRowHeight={280}` |
| Spacing | `spacing={2}` |
| Image style | `rounded-sm hover:brightness-90` |

### Selection Mode

| State | Style |
|-------|-------|
| Unselected | `bg-white/80 backdrop-blur-sm` circle indicator |
| Selected | `bg-blue-500` filled circle + `ring-2 ring-inset ring-blue-500` |

### Video Overlays

Videos in the grid show a play icon and duration badge:
- Play: `bg-black/50 backdrop-blur-sm rounded-full`
- Duration: `text-[11px] text-white drop-shadow`

---

## Media Viewer

Full-screen lightbox for viewing media with metadata sidebar.

| Property | Value |
|----------|-------|
| Size | `w-[95vw] h-[92vh]` |
| Background | `bg-black` |
| Layout | `grid grid-cols-1 lg:grid-cols-[1fr_300px]` |

### Navigation

Prev/next buttons: `rounded-full bg-white/10 backdrop-blur-sm`

### Metadata Sidebar

Uses the same patterns as right panels:
- Section labels: `text-[10px] text-dim font-mono uppercase tracking-widest`
- Detail rows: `text-[11px] text-dim font-mono` / `text-[12px] text-sensor`

### Actions

- Download button
- Delete (via AlertDialog confirmation)

---

## Tokens Used

| Token | Tailwind | Usage |
|-------|----------|-------|
| `--background` | `bg-background` | Album card bg |
| `--card` | `bg-card` | Album card hover bg |
| `--elevated` | `bg-elevated` | Image placeholder |
| `--dim` | `text-dim` | Metadata, counts, section labels |
| `--sensor` | `text-sensor` | Detail row values |
| `--border` | `border-border` | Viewer dialog border |
| `--destructive` | destructive | Delete confirmation |

---

## Rules

1. **Album cards use 4:3 aspect ratio.** Video thumbnails use 16:9.
2. **Media grid is rows-based**, not a fixed column grid. Row height adapts.
3. **Selection uses blue ring** — `ring-blue-500`, not primary.
4. **Viewer opens in a Dialog**, not a separate page.
5. **Delete in viewer requires AlertDialog** confirmation.
6. **Video overlays show duration** in `text-[11px]` with drop shadow.
