# Script Editor

> Preview: open `preview.html#editor` in a browser

**Files:** `ScriptEditorTiptap.tsx`, `tiptap/ScriptBlock.tsx`, `tiptap/SlashCommand.tsx`, `tiptap/MentionSuggestion.tsx`

---

## Overview

The script editor is a Tiptap-based rich text editor with Yjs collaboration, slash commands, @-mentions, and custom script block nodes.

---

## Editor Container

```tsx
<div className="script-editor-tiptap min-h-[800px]">
  <EditorContent editor={editor} className="tiptap-editor outline-none min-h-[600px] pb-[200px]" />
</div>
```

---

## Floating Toolbar

Appears on text selection:

| Property | Value |
|----------|-------|
| Position | `fixed z-50` |
| Style | `flex items-center gap-0.5 bg-card border border-white/10 rounded-lg` |
| Buttons | Bold, Italic, Link toggles |

---

## Script Blocks

Custom Tiptap node extension for structured script sections (title, hook, script, hashtags, etc.).

Each block type has a CSS variable color:
- `--script-block-title`
- `--script-block-hook`
- `--script-block-script`
- `--script-block-hashtags`

| Part | Class |
|------|-------|
| Block | `script-block` container div |
| Label | `script-block-label` with colored dot (`script-block-label-dot`) |
| Content | `script-block-content` editable area |

---

## Slash Command Menu

Triggered by typing `/` at the start of a line.

| Property | Value |
|----------|-------|
| Renderer | Tippy.js popup with `theme: "slash-command"` |
| Item | `slash-menu-item` with icon, title, description |
| Selected | `slash-menu-item.is-selected` |

---

## Mention Suggestion

Triggered by typing `@` to mention collaborators.

| Property | Value |
|----------|-------|
| Renderer | Tippy.js popup with `theme: "mention-menu"` |
| Item | `mention-menu-item` with avatar + name |
| Selected | `mention-menu-item.is-selected` |
| Avatar | `mention-menu-avatar` or `mention-menu-avatar-placeholder` |

---

## Collaboration

Uses Yjs via Hocuspocus for real-time collaboration.

| Feature | Implementation |
|---------|---------------|
| Provider | `HocuspocusProvider` connecting to `collaborationWsUrl` |
| Cursors | `CollaborationCursor` extension with user colors |
| Saving | Debounced `onUpdate` callback |

---

## Tokens Used

| Token | CSS / Tailwind | Usage |
|-------|----------------|-------|
| `--card` | `bg-card` | Floating toolbar bg |
| `--border` | `border-white/10` | Toolbar border |
| `--foreground` | `text-foreground` | Editor text |
| Script block vars | `--script-block-*` | Block type label colors |

---

## Rules

1. **Editor minimum height is `800px`.** Content area is `600px` with `200px` bottom padding.
2. **Slash commands only trigger at line start.** Not inline.
3. **Mentions require `@` trigger.** User list comes from `currentUser` + collaborators.
4. **Script blocks are non-deletable** — they structure the script content.
5. **Floating toolbar uses `bg-card border-white/10`**, not standard popover tokens.
6. **Collaboration is opt-in** — editor works standalone when `roomId` is not provided.
