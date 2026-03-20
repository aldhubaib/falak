# Story Detail

> Preview: open `preview.html#story-detail` in a browser

**Files:** `story-detail/*.tsx`

---

## Overview

The Story Detail page is the richest page in the app. It contains a top bar, article panel, script editor, score bars, transcript, video upload, channel selector, and stage-specific views.

---

## Top Bar

```
┌──────────────────────────────────────────────────────┐
│ ← Back  │ Stage dropdown ▾ │ Prev/Next │ History    │
└──────────────────────────────────────────────────────┘
```

| Property | Value |
|----------|-------|
| Height | `min-h-[48px]` |
| Layout | `flex items-center justify-between px-6 border-b border-border` |
| Stage dropdown | `absolute z-20 mt-2 right-0 w-48 rounded-xl bg-card` |

Stage colors use a `STAGE_COLOR_CLASS` map for each pipeline stage.

---

## Article Panel

Collapsible panel showing the original article with action buttons.

| Part | Style |
|------|-------|
| Container | `rounded-xl bg-background border border-border` |
| Source badges | Colored by source type (emerald, teal, blue, orange, zinc) |
| Article body | Supports RTL via `dir="rtl"` |
| Actions | Cleanup, Re-fetch, Retry (icon buttons with tooltips) |

---

## Score Bar

Horizontal metrics bar showing Relevance, Virality, First Mover scores.

```tsx
<div className="flex-1 px-5 py-4 bg-background border-r border-background">
  <p className="text-[10px] text-dim font-mono uppercase tracking-wider">{label}</p>
  <div className="h-1.5 rounded-full bg-elevated mt-2">
    <div className="h-full rounded-full" style={{ width: `${value}%` }} />
  </div>
</div>
```

| Score | Bar Color |
|-------|-----------|
| Relevance | `bg-purple` |
| Virality | `bg-blue` |
| First Mover | `bg-success` |

---

## Channel Selector

Dropdown to assign a channel to the story.

| Part | Style |
|------|-------|
| Container | `rounded-xl bg-background p-5` |
| Trigger | `rounded-full bg-card border border-border` pill button |
| Dropdown | `absolute z-10 mt-1.5 w-full rounded-xl bg-elevated border border-border shadow-lg` |
| Items | Avatar or initials fallback + channel name |

---

## Script Section

Contains channel selector, duration input, Generate button, format toggle, and the Tiptap editor.

| Part | Style |
|------|-------|
| Container | `rounded-xl bg-background border border-border` |
| Controls bar | Inline flex with channel, duration, Generate |
| Format toggle | Short/Long pill toggle |
| Collaborator avatars | `-space-x-2` stack |

---

## Transcript Section

Collapsible transcript with timestamps and Whisper badge.

| Part | Style |
|------|-------|
| Container | `rounded-xl bg-background border border-border` |
| Segments | Timestamps + text content |
| Whisper badge | `text-success/70 bg-success/10` |

---

## Video Upload

See [uploads.md](./uploads.md) for the upload zone pattern.

---

## Stage Views

| Stage | Component | Behaviour |
|-------|-----------|-----------|
| Omitted | `StoryDetailStageOmit` | Message + "Move back" button |
| Passed | `StoryDetailStagePassed` | Message + "Move back" button |
| Publish | `StoryDetailStagePublish` | YouTube description, subtitles, URL input |

Stage containers: `rounded-xl bg-background p-5` with `border border-border`.

---

## Copy Button

Small inline copy-to-clipboard button used across sections.

```tsx
<button className="text-[11px] text-dim hover:text-sensor font-mono flex items-center gap-1">
  <Copy className="w-3 h-3" /> Copy
</button>
```

Shows `Check` icon + toast on success.

---

## Tokens Used

| Token | Tailwind | Usage |
|-------|----------|-------|
| `--background` | `bg-background` | Section containers |
| `--card` | `bg-card` | Selector trigger, top bar dropdown |
| `--elevated` | `bg-elevated` | Score bar track, selector dropdown |
| `--border` | `border-border` | All section borders |
| `--dim` | `text-dim` | Labels, mono text, copy button |
| `--sensor` | `text-sensor` | Secondary metadata |
| `--purple` | `bg-purple` | Relevance score bar |
| `--blue` | `bg-blue` | Virality score bar |
| `--success` | `bg-success` | First Mover bar, Whisper badge |
| `--destructive` | `text-destructive` | Error states |

---

## Rules

1. **All sections use `rounded-xl bg-background border border-border`.**
2. **Stage actions require AlertDialog** for destructive moves (Omit, Pass, Restart).
3. **Score bars always show three metrics** in the same order: Relevance, Virality, First Mover.
4. **Article supports RTL** — the `dir` attribute is set based on content language.
5. **Copy buttons use the mono pattern**: `text-[11px] text-dim font-mono`.
6. **Collaborator avatars overlap** with `-space-x-2` and `border-2 border-background`.
