# Badges

> Preview: open `preview.html#badges` in a browser

**File:** `frontend/src/components/ui/badge.tsx`
**Built with:** `cva` + `cn()`

---

## Style

All badges use the **outline** style: transparent background, `border border-border`, only the **text color** changes to indicate status.

| Property | Value |
|----------|-------|
| Background | `transparent` |
| Border | `border border-border` |
| Shape | `rounded-full` (pill) |
| Padding | `px-2.5 py-0.5` |
| Font | `text-xs font-semibold` |

---

## Status Colors

| Status | Text Color | Usage |
|--------|-----------|-------|
| Default | `text-foreground` | Neutral, active |
| Published | `text-success` | Published, complete, active |
| Filming | `text-blue` | In-progress, filming |
| Script | `text-orange` | Script stage, warning, pending |
| Failed | `text-destructive` | Error, failed, rejected |
| Draft | `text-dim` | Draft, inactive, disabled |

---

## Code

```tsx
import { Badge } from "@/components/ui/badge";

<Badge variant="outline">Default</Badge>
<Badge variant="outline" className="text-success">Published</Badge>
<Badge variant="outline" className="text-blue">Filming</Badge>
<Badge variant="outline" className="text-orange">Script</Badge>
<Badge variant="outline" className="text-destructive">Failed</Badge>
<Badge variant="outline" className="text-dim">Draft</Badge>
```

---

## Tokens Used

| Token | Usage |
|-------|-------|
| `--border` | Badge border |
| `--foreground` | Default text |
| `--success` | Published / complete |
| `--blue` | In-progress / filming |
| `--orange` | Script / pending |
| `--destructive` | Failed / error |
| `--dim` | Draft / inactive |

---

## Rules

1. **Always use outline style** — no filled/solid background badges.
2. **Only the text color changes** to indicate status.
3. **Keep text short** — one or two words max.
4. **Don't stack badges** — one badge per item is enough.
5. **Use semantic colors** — success for positive, destructive for negative, blue for in-progress.
