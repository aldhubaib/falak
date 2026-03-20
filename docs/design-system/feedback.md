# Feedback & Utilities

> Preview: open `preview.html#feedback` in a browser

**Files:** `PageError.tsx`, `DeleteChannelModal.tsx`, `VideoTypeIcon.tsx`

---

## Page Error

Full-page error view with icon, message, debug info, and actions.

```
┌─────────────────────────────┐
│         ⚠ Error Icon        │
│                             │
│     Something went wrong    │  ← title
│   Could not load channel    │  ← message
│                             │
│   [fingerprint: abc123]     │  ← mono debug ID
│                             │
│  ▸ Show details             │  ← expandable stack trace
│                             │
│   [Copy]  [Retry]  [Home]   │  ← action buttons
└─────────────────────────────┘
```

| Property | Value |
|----------|-------|
| Container | `min-h-[60vh] flex items-center justify-center p-6` |
| Card | `max-w-lg rounded-xl border border-border bg-background p-6` |
| Icon | `bg-destructive/10` tinted background |
| Fingerprint | `text-[11px] font-mono` |
| Detail toggle | Expandable with full error stack |

### Props

| Prop | Type | Purpose |
|------|------|---------|
| `title` | `string?` | Error heading (default: "Something went wrong") |
| `message` | `string` | Error description |
| `detail` | `string?` | Technical detail |
| `componentStack` | `string?` | React component stack |
| `onRetry` | `() => void?` | Retry callback |
| `showHome` | `boolean?` | Show home link |

---

## Delete Channel Modal

Confirmation dialog for removing a channel. Uses AlertDialog.

```tsx
<AlertDialog open={open}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Remove this channel?</AlertDialogTitle>
      <AlertDialogDescription>
        This will remove <span className="text-foreground font-medium">{channelName}</span> and all data.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel onClick={onClose}>Cancel</AlertDialogCancel>
      <AlertDialogAction
        className="bg-destructive text-destructive-foreground"
        onClick={onDelete}
      >
        Remove
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

---

## Video Type Icon

Small icon distinguishing video types.

```tsx
import { VideoTypeIcon } from "@/components/VideoTypeIcon";

<VideoTypeIcon type="video" />  {/* Play icon */}
<VideoTypeIcon type="short" />  {/* Zap icon */}
```

| Property | Value |
|----------|-------|
| Size | `w-3.5 h-3.5` (default) |
| Color | `text-dim` |
| Display | `inline-flex shrink-0` |

---

## Text Shimmer

Sweeping highlight over text to indicate an in-progress operation.
Use instead of static "Loading..." text.

```tsx
<span className="text-shimmer">Generating script…</span>
```

| Property | Value |
|----------|-------|
| Class | `text-shimmer` |
| Base color | `--dim` |
| Highlight color | `--foreground` (white sweep) |
| Cycle | `1.8s` ease-in-out, infinite |
| Technique | `background-clip: text` gradient |

### When to use

| Scenario | Use |
|----------|-----|
| Status text while AI is working | `text-shimmer` |
| Block placeholder while loading | `Skeleton` (pulse) |
| Toast while processing | Static text, no shimmer |

---

## AI Cursor

Blinking caret that shows the AI writer's current state.

```tsx
{/* Idle — slow blink */}
<span className="ai-cursor ai-cursor--idle" />

{/* Thinking — fast blink + shimmer on status text */}
<span className="ai-status-word--shimmer">Planning outline</span>
<span className="ai-cursor ai-cursor--thinking" />

{/* Writing — solid, no blink */}
<span className="ai-cursor ai-cursor--writing" />
```

| State | Cursor | Status text | Blink speed |
|-------|--------|-------------|-------------|
| Idle | `--dim` | Static | 1.1s |
| Thinking | `--dim` | Shimmer sweep | 0.55s |
| Writing | `--foreground` | None (streaming) | No blink |

| Token | Value | Usage |
|-------|-------|-------|
| `--cursor-width` | `2px` | Caret width |
| `--cursor-height` | `0.95em` | Caret height |
| `--shimmer-base` | `hsl(var(--dim))` | Gradient start/end |
| `--shimmer-highlight` | `hsl(var(--foreground))` | Gradient peak |
| `--shimmer-duration` | `1.8s` | Sweep cycle |

---

## Tokens Used

| Token | Tailwind | Usage |
|-------|----------|-------|
| `--background` | `bg-background` | Error card bg |
| `--border` | `border-border` | Error card border |
| `--destructive` | `bg-destructive/10`, `bg-destructive` | Error icon tint, delete action |
| `--destructive-foreground` | `text-destructive-foreground` | Delete button text |
| `--foreground` | `text-foreground` | Channel name emphasis |
| `--dim` | `text-dim` | VideoTypeIcon default color, shimmer base, cursor idle |
| `--shimmer-base` | — | Shimmer gradient start/end |
| `--shimmer-highlight` | — | Shimmer gradient peak |
| `--shimmer-duration` | — | Shimmer sweep speed (1.8s) |

---

## Rules

1. **PageError for route-level errors.** Not for inline validation.
2. **Delete modals always use AlertDialog**, not Dialog.
3. **Destructive action button: `bg-destructive text-destructive-foreground`.**
4. **VideoTypeIcon is inline** — size it with className override.
5. **Error fingerprints** use mono font for copyability.
6. **Channel name is bold** in the delete confirmation to prevent mistakes.
7. **Use `text-shimmer` for in-progress text**, not `animate-pulse` on text.
8. **AI cursor must match writer state** — idle/thinking/writing.
9. **Never apply shimmer to article or script body text** — only status labels.
