# Sidebar

> Preview: open `preview.html#sidebar` in a browser

**File:** `frontend/src/components/AppSidebar.tsx`

---

## Overview

The sidebar is the main navigation element. It collapses between icon-only (`56px`) and expanded (`220px`) widths. It holds the channel avatar, navigation links, user area, and logout.

---

## States

| State | Width | Behaviour |
|-------|-------|-----------|
| Collapsed | `w-[56px]` | Icons only, tooltip labels on hover |
| Expanded | `w-[220px]` | Icons + text labels |
| Mobile | Full overlay | Slide-in sheet controlled by `onClose` |

---

## Anatomy

```
┌──────────────────────┐
│  Channel avatar/name  │  ← header area
├──────────────────────┤
│  Nav link             │  ← `rounded-full` pill items
│  Nav link (active)    │  ← `bg-elevated` active state
│  Nav link             │
│  ...                  │
├──────────────────────┤
│  User area            │  ← avatar + name
│  Logout               │
└──────────────────────┘
```

---

## Nav Item Styling

| State | Class |
|-------|-------|
| Default | `text-dim` icon, `text-sensor` label |
| Hover | `text-foreground` |
| Active | `bg-elevated text-foreground` |
| Shape | `rounded-full` pill |

---

## Props

| Prop | Type | Purpose |
|------|------|---------|
| `channelId` | `string` | Current channel context |
| `collapsed` | `boolean` | Collapsed state |
| `pinned` | `boolean` | Pin sidebar open |
| `onTogglePin` | `() => void` | Toggle pin |
| `isMobile` | `boolean` | Mobile mode |
| `onClose` | `() => void` | Close mobile overlay |

---

## Tokens Used

| Token | Tailwind | Usage |
|-------|----------|-------|
| `--sidebar` | `bg-sidebar` | Sidebar background |
| `--elevated` | `bg-elevated` | Active nav item |
| `--dim` | `text-dim` | Resting icon color |
| `--sensor` | `text-sensor` | Resting label color |
| `--foreground` | `text-foreground` | Hover/active text |

---

## Rules

1. **One sidebar per page.** Rendered inside `AppLayout`.
2. **Active state uses `bg-elevated`**, not `bg-primary`.
3. **Collapsed mode shows tooltips** on nav item hover — mandatory.
4. **Mobile sidebar is a Dialog overlay**, not absolute positioned.
5. **Transition: `transition-all duration-200`.** Smooth width change.
