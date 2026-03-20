# Avatars

> Preview: open `preview.html#avatars` in a browser

**File:** `frontend/src/components/ui/avatar.tsx`
**Built with:** Radix Avatar + `cn()`

---

## Usage

```tsx
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

<Avatar>
  <AvatarImage src={user.avatarUrl} alt={user.name} />
  <AvatarFallback>AB</AvatarFallback>
</Avatar>
```

---

## Sizes

The base component is `h-10 w-10`. Override with className:

| Size | Class | When to Use |
|------|-------|-------------|
| Small | `h-6 w-6` | Inline mentions, collab indicators |
| Default | `h-10 w-10` | User profile, sidebar |
| Large | `h-14 w-14` | Profile pages, headers |

```tsx
<Avatar className="h-6 w-6">
  <AvatarImage src={url} />
  <AvatarFallback className="text-[10px]">AB</AvatarFallback>
</Avatar>
```

---

## Stacked Avatars (Collaborators)

Used in the script editor to show active collaborators:

```tsx
<div className="flex -space-x-2">
  {users.map(u => (
    <Avatar key={u.id} className="h-6 w-6 border-2 border-background">
      <AvatarImage src={u.avatar} />
      <AvatarFallback className="text-[10px]">{u.initials}</AvatarFallback>
    </Avatar>
  ))}
</div>
```

---

## Anatomy

| Part | Class |
|------|-------|
| Root | `relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full` |
| Image | `aspect-square h-full w-full` |
| Fallback | `flex h-full w-full items-center justify-center rounded-full bg-muted` |

---

## Tokens Used

| Token | Tailwind | Usage |
|-------|----------|-------|
| `--muted` | `bg-muted` | Fallback background |
| `--background` | `border-background` | Stack border overlap |

---

## Rules

1. **Always provide a fallback.** Use 1–2 uppercase initials.
2. **Fallback text scales with size.** `text-[10px]` for small, default for standard.
3. **Stacked avatars need `border-2 border-background`** to show separation.
4. **Use `rounded-full` always.** Avatars are circular.
