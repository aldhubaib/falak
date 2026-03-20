# Toasts

> Preview: open `preview.html#toasts` in a browser

**Library:** Sonner
**File:** `frontend/src/components/ui/sonner.tsx`

---

## Usage

```tsx
import { toast } from "sonner";

toast.success("Channel synced");
toast.error("Failed to save script");
toast.info("Retrying processing…");
```

---

## Variants

| Variant | When to Use | Examples |
|---------|-------------|---------|
| `toast.success()` | Action completed | "Copied", "Album renamed", "Video ready to publish" |
| `toast.error()` | Action failed or validation error | "Failed to save", "Please enter a key value" |
| `toast.info()` | Background process started | "Retrying processing…", "Generating script…" |

---

## Rules

1. **Always use a variant.** Never plain `toast()`.
2. **Keep messages short** — 2–6 words.
3. **Past tense for success** — "Copied", "Saved", "Deleted".
4. **Present tense for errors** — "Failed to save", "Network error".
5. **Progressive for info** — "Generating…", "Retrying…".
6. **Describe the result, not the action** — "Copied" not "Copy button clicked".
