# Alerts

> Preview: open `preview.html#alerts` in a browser

**File:** `frontend/src/components/ui/alert.tsx`
**Built with:** CVA + `cn()`

---

## Variants

| Variant | Look | When to Use |
|---------|------|-------------|
| `default` | Foreground text, standard border | Informational banners, tips, notices |
| `destructive` | Red text, red border | Error messages, critical warnings |

```tsx
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

<Alert>
  <AlertCircle className="h-4 w-4" />
  <AlertTitle>Heads up</AlertTitle>
  <AlertDescription>This channel has no API key configured.</AlertDescription>
</Alert>

<Alert variant="destructive">
  <AlertCircle className="h-4 w-4" />
  <AlertTitle>Fetch failed</AlertTitle>
  <AlertDescription>Could not reach YouTube API after 3 retries.</AlertDescription>
</Alert>
```

---

## Anatomy

| Part | Class |
|------|-------|
| Container | `relative w-full rounded-lg border p-4` |
| Icon | Absolute positioned `left-4 top-4`, pushes siblings with `pl-7` |
| Title | `mb-1 font-medium leading-none tracking-tight` |
| Description | `text-sm [&_p]:leading-relaxed` |

---

## Tokens Used

| Token | Tailwind | Usage |
|-------|----------|-------|
| `--background` | `bg-background` | Default variant bg |
| `--foreground` | `text-foreground` | Default variant text + icon |
| `--destructive` | `text-destructive` / `border-destructive` | Destructive variant |

---

## Rules

1. **Always include an icon.** The layout reserves space for it.
2. **Use `destructive` for errors only.** Informational messages use `default`.
3. **Don't use Alert for toasts.** Alerts are inline; toasts are transient.
4. **Keep titles short** — one line max. Details go in `AlertDescription`.
