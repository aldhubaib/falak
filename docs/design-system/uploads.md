# Uploads

> Preview: open `preview.html#uploads` in a browser

**Files:** `UploadIndicator.tsx`, `GalleryUploadIndicator.tsx`, `gallery/UploadZone.tsx`, `story-detail/VideoUpload.tsx`

---

## Upload Zone (Drag & Drop)

Full drop target with visual feedback.

| State | Style |
|-------|-------|
| Default | `rounded-xl border-2 border-dashed border-border bg-background` |
| Dragging | `border-primary bg-primary/5` |
| Preview grid | `grid grid-cols-6 gap-2` |

```tsx
<div className="rounded-xl border-2 border-dashed border-border py-16 flex flex-col items-center gap-3">
  <Upload className="w-8 h-8 text-dim" />
  <p className="text-[13px] text-dim">Drag files here or click to browse</p>
  <Button variant="outline" size="sm">Browse Files</Button>
</div>
```

---

## Video Upload

Inline upload with thumbnail preview. Adapts aspect ratio to video format:

| Format | Aspect | Class |
|--------|--------|-------|
| Long (video) | 16:9 | `aspect-video` |
| Short | 9:16 | `aspect-[9/16]` |

Layout: `rounded-xl overflow-hidden border border-border flex bg-background`

Metadata uses the standard mono label pattern: `text-[10px] text-dim font-mono uppercase tracking-wider`.

---

## Upload Indicator (Stories)

Fixed bottom-right progress indicator for story uploads.

| Property | Value |
|----------|-------|
| Position | `fixed bottom-4 right-4 z-50` |
| Width | `w-72` |
| Background | `bg-background border border-border rounded-xl shadow-2xl` |
| Progress bar | `h-1 bg-elevated rounded-full` |
| Status text | `text-[11px] font-mono truncate` |

Status colors:
- Uploading: `text-blue`
- Complete: `text-emerald-400`
- Failed: `text-red-400`

---

## Gallery Upload Indicator

Fixed bottom-left progress indicator for gallery uploads.

| Property | Value |
|----------|-------|
| Position | `fixed bottom-4 left-4 z-50` |
| Width | `w-80` |
| Max height | `max-h-56 overflow-y-auto` |
| Background | Same as Upload Indicator |

Uses the `Progress` component for individual file progress bars.

---

## Tokens Used

| Token | Tailwind | Usage |
|-------|----------|-------|
| `--border` | `border-border` | Zone border, indicator border |
| `--primary` | `border-primary` / `bg-primary/5` | Active drag state |
| `--background` | `bg-background` | Indicator/zone bg |
| `--dim` | `text-dim` | Placeholder text, icons |
| `--elevated` | `bg-elevated` | Progress bar fill |

---

## Rules

1. **Upload zones use dashed borders.** Solid borders are for containers.
2. **Drag state changes border to primary** with subtle background tint.
3. **Upload indicators are fixed-position** — they persist across navigation.
4. **Story uploads bottom-right, gallery uploads bottom-left.** No overlap.
5. **Progress text is mono**: `font-mono text-[11px]`.
6. **Failed uploads show red** with retry option.
