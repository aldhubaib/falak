# Panels

> Preview: open `preview.html#panels` in a browser

**Files:** `ChannelRightPanel.tsx`, `VideoRightPanel.tsx`, `ChannelLayout.tsx`

---

## Right Panel Pattern

Both `ChannelRightPanel` and `VideoRightPanel` follow the same floating panel pattern:

```
┌────────────────────────┐
│  Close (×)  Title      │  ← header
├────────────────────────┤
│  Avatar / Thumbnail    │  ← hero area
├────────────────────────┤
│  SECTION LABEL         │  ← mono label
│  Key          Value    │  ← info rows
│  Key          Value    │
├────────────────────────┤
│  SECTION LABEL         │
│  Toggle / Select       │
├────────────────────────┤
│  Action buttons        │  ← icon buttons in row
└────────────────────────┘
```

---

## Shared Styling

| Property | Value |
|----------|-------|
| Position | `absolute top-2 right-2 z-50` |
| Width | `w-[260px]` |
| Background | `bg-card` |
| Border | `border border-border` |
| Radius | `rounded-xl` |
| Shadow | `shadow-xl shadow-black/30` |
| Entry animation | `animate-in fade-in slide-in-from-top-2 duration-150` |

---

## Section Labels

```tsx
<p className="text-[11px] text-dim font-mono uppercase tracking-widest mb-2">
  Overview
</p>
```

---

## Info Row

Key-value pairs inside panels:

```tsx
<div className="flex items-center justify-between py-2.5 border-b border-border last:border-b-0">
  <span className="text-[12px] text-sensor">{label}</span>
  <span className="text-[13px] text-foreground">{value}</span>
</div>
```

---

## Channel Right Panel Props

| Prop | Type | Purpose |
|------|------|---------|
| `channel` | `object` | Channel data |
| `visible` | `boolean` | Show/hide |
| `onClose` | `() => void` | Close panel |
| `onSyncNow` | `() => void` | Sync action |
| `onAnalyzeAll` | `() => void` | Analyze action |
| `onRemove` | `() => void` | Remove (destructive, via AlertDialog) |

---

## Video Right Panel Props

| Prop | Type | Purpose |
|------|------|---------|
| `video` | `object` | Video data |
| `visible` | `boolean` | Show/hide |
| `onClose` | `() => void` | Close panel |
| `pipeline` | `object` | Pipeline status |

---

## Channel Layout

Wrapper component for `/c/:channelId` routes. Validates channel access and renders `<Outlet>` or `<PageError>` if the channel is not found.

---

## Tokens Used

| Token | Tailwind | Usage |
|-------|----------|-------|
| `--card` | `bg-card` | Panel background |
| `--border` | `border-border` | Panel border, section dividers |
| `--dim` | `text-dim` | Section labels |
| `--sensor` | `text-sensor` | Info row keys |
| `--foreground` | `text-foreground` | Info row values |
| `--destructive` | destructive actions | Remove confirmation |

---

## Rules

1. **Panels float over content** — they don't push the layout.
2. **Close button is always top-right** inside the panel header.
3. **Destructive actions (remove) require AlertDialog** confirmation.
4. **Section labels use the mono label pattern**: `text-[11px] text-dim font-mono uppercase tracking-widest`.
5. **Info rows are separated by `border-b`**, last row has none.
