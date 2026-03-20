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

## Tokens Used

| Token | Tailwind | Usage |
|-------|----------|-------|
| `--background` | `bg-background` | Error card bg |
| `--border` | `border-border` | Error card border |
| `--destructive` | `bg-destructive/10`, `bg-destructive` | Error icon tint, delete action |
| `--destructive-foreground` | `text-destructive-foreground` | Delete button text |
| `--foreground` | `text-foreground` | Channel name emphasis |
| `--dim` | `text-dim` | VideoTypeIcon default color |

---

## Rules

1. **PageError for route-level errors.** Not for inline validation.
2. **Delete modals always use AlertDialog**, not Dialog.
3. **Destructive action button: `bg-destructive text-destructive-foreground`.**
4. **VideoTypeIcon is inline** — size it with className override.
5. **Error fingerprints** use mono font for copyability.
6. **Channel name is bold** in the delete confirmation to prevent mistakes.
