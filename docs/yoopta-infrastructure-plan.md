# Yoopta Infrastructure Plan

**Goal:** 100% functional and scalable infrastructure for the Yoopta script editor in Falak.

**Status:** Planning document  
**Last updated:** 2025-03-16

---

## 1. Executive Summary

This plan outlines the steps to make the Yoopta editor integration fully functional, reliable, and scalable. It covers data flow, persistence, sync logic, type safety, and future extensibility.

---

## 2. Current State

### What Works
- Yoopta editor renders with correct plugins/marks
- Value syncs from parent → editor via `useEffect`
- Debounced save (1.5s) on `brief.scriptYoopta` changes
- `key={id}` on `StoryDetailScriptSection` forces remount when switching stories
- Read-only mode when stage ≠ scripting
- `brief.scriptYoopta` persisted in `brief` JSON via PATCH

### Gaps & Risks
- `scriptSaved` checks only `brief.script`, not `brief.scriptYoopta`
- Generate-script flow may not populate `scriptYoopta`, only `script`
- No bidirectional conversion (plain text ↔ Yoopta)
- Reference equality for sync can miss updates when parent passes new references
- Unused Yoopta packages bloat bundle
- `StoryBrief.scriptYoopta` typed as `unknown`

---

## 3. Phase 1: Data Integrity & Consistency

### 1.1 Unify script source of truth

**Problem:** Scripts can live in `brief.script` (plain text) or `brief.scriptYoopta` (rich JSON). Logic is inconsistent.

**Solution:**
- Treat `scriptYoopta` as the primary source when present
- Fall back to `scriptTextToYooptaValue(brief.script)` when `scriptYoopta` is absent
- Add `yooptaValueToScriptText` for export, AI, and backward compatibility

**Implementation:**
```
1. editorInitialValue.ts: Add yooptaValueToScriptText(value) → string
2. StoryDetail: scriptSaved = !!(brief.scriptYoopta ?? brief.script)
3. Any API that consumes script: use yooptaValueToScriptText when scriptYoopta exists
```

### 1.2 Generate-script flow

**Problem:** Generate script API likely returns plain text and updates `brief.script`. Editor may not show it if it expects `scriptYoopta`.

**Solution:**
- After generate-script completes, `loadStory()` fetches updated story
- Backend must include `scriptYoopta` in the brief when saving generated content, OR
- Frontend: when `loadStory` returns `brief.script` but not `scriptYoopta`, the editor already shows `scriptTextToYooptaValue(brief.script)` — verify this path works
- Ensure generate-script endpoint either:
  - Returns `scriptYoopta` (Yoopta JSON) in addition to `script`, or
  - Frontend converts `script` → `scriptYoopta` and stores in brief before save

**Implementation:**
```
1. Audit generate-script API response and what it writes to brief
2. If backend only writes script: add frontend step to convert script → scriptYoopta and setBrief before save
3. If backend can accept scriptYoopta: extend API to accept and store it
```

### 1.3 Type safety

**Problem:** `StoryBrief.scriptYoopta` is `unknown`.

**Solution:**
- Change to `scriptYoopta?: YooptaContentValue`
- Import `YooptaContentValue` in types.ts
- Add runtime validation when loading brief from API (optional, for robustness)

---

## 4. Phase 2: Editor Sync & Reliability

### 2.1 Value sync robustness

**Problem:** `lastSyncedValueRef.current === toSet` uses reference equality. Parent may pass new references.

**Solution:**
- Option A: Keep reference check; rely on parent memoization (current approach)
- Option B: Add shallow/deep comparison: only sync when content actually differs
- Option C: Use a stable identity (e.g. `id` or hash) when available

**Implementation:**
```
1. Add helper: areYooptaValuesEqual(a, b) — compare block IDs and content
2. In ScriptEditorYoopta effect: if (areYooptaValuesEqual(lastSyncedValueRef.current, toSet)) return
3. Only call setEditorValue when content differs
```

### 2.2 Avoid sync loops

**Problem:** `setEditorValue` could trigger `onChange`, causing parent update → effect → set again.

**Solution:**
- Yoopta’s `withoutSavingHistory` may suppress onChange; verify in docs
- If not: add a flag `isSyncingFromParentRef` — set before `setEditorValue`, clear after; in `onChange`, skip calling parent when flag is set

### 2.3 readOnly handling

**Problem:** Recreating editor when `readOnly` changes can cause flash.

**Solution:**
- Option A (current): keep recreation; acceptable for stage switching
- Option B: pass `readOnly` only to `YooptaEditor`, not to `createYooptaEditor`; single editor instance

---

## 5. Phase 3: Content Conversion & Interop

### 5.1 Plain text → Yoopta

**Current:** `scriptTextToYooptaValue(text)` — single block

**Improvements:**
- Add `scriptTextToYooptaValue(text, options?)` with `splitBlocks?: boolean` — split on `\n\n` for multi-paragraph
- Preserve basic structure (e.g. timestamps like `00:00`) if needed for script format

### 5.2 Yoopta → Plain text

**New:** `yooptaValueToScriptText(value: YooptaContentValue): string`

**Implementation:**
- Walk blocks in `meta.order`
- For each block, extract text from `value[].children`
- Join with `\n` or `\n\n` based on block type
- Use for: export, AI API, clipboard, backward compatibility

### 5.3 Migration path

**Problem:** Existing stories may have only `brief.script` (plain text).

**Solution:**
- On load: if `scriptYoopta` absent and `script` present, use `scriptTextToYooptaValue(script)` as display value
- On save: always persist `scriptYoopta` when user edits; optionally keep `script` in sync via `yooptaValueToScriptText` for legacy consumers

---

## 6. Phase 4: Scalability & Extensibility

### 6.1 Plugin architecture

**Current:** Fixed PLUGINS array in ScriptEditorYoopta

**Future:**
- Allow plugins to be passed as props: `plugins?: YooptaPlugin[]` with default
- Support project-level or user-level plugin preferences
- Create a `ScriptEditorPlugins` config module for shared defaults

### 6.2 Reusable editor component

**Current:** ScriptEditorYoopta is script-specific

**Improvements:**
- Extract `YooptaEditorWrapper` (generic) with props: `value`, `onChange`, `readOnly`, `plugins?`, `marks?`, `placeholder?`
- `ScriptEditorYoopta` becomes a thin wrapper with script-specific defaults
- Enables reuse for article content, notes, etc.

### 6.3 Bundle size

**Current:** Many unused Yoopta packages installed

**Solution:**
- Remove: accordion, code, embed, file, image, steps, table, table-of-contents, tabs, themes-shadcn, video
- Keep: editor, paragraph, headings, blockquote, callout, lists, divider, link, marks, ui
- Add packages only when a feature requires them

---

## 7. Phase 5: Testing & Observability

### 7.1 Unit tests

- `editorInitialValue.ts`: `scriptTextToYooptaValue`, `yooptaValueToScriptText`, `areYooptaValuesEqual`
- `ScriptEditorYoopta`: render with value, readOnly; onChange called when editing
- Integration: StoryDetail → ScriptEditorYoopta with mock brief

### 7.2 E2E tests

- Open story in scripting stage → edit script → verify save
- Switch stories → verify correct script per story
- Generate script → verify editor shows result
- Read-only mode (filmed) → no editor tools

### 7.3 Error handling

- Invalid `brief.scriptYoopta` (malformed JSON): fall back to `scriptTextToYooptaValue(brief.script)` or empty
- Editor crash: error boundary around ScriptEditorYoopta with fallback to plain textarea

---

## 8. Phase 6: API & Backend Alignment

### 8.1 Brief schema

- Document `brief.scriptYoopta` in API schema
- Ensure `brief` JSON column accepts large payloads (script can be long)

### 8.2 Generate-script flow

- Document whether API returns `script`, `scriptYoopta`, or both
- If only `script`: frontend converts and stores `scriptYoopta` after generation
- If API can accept `scriptYoopta`: add to request/response contract

### 8.3 Search / export

- If scripts are searched or exported: add `yooptaValueToScriptText` in backend or use pre-computed `script` field when available

---

## 9. Implementation Order

| Phase | Priority | Effort | Dependencies |
|-------|----------|--------|--------------|
| 1.1 Unify script source | P0 | S | None |
| 1.2 Generate-script flow | P0 | M | 1.1 |
| 1.3 Type safety | P1 | S | None |
| 2.1 Value sync robustness | P1 | M | None |
| 2.2 Avoid sync loops | P1 | S | 2.1 |
| 2.3 readOnly handling | P2 | S | None |
| 5.1 Plain text → Yoopta | P1 | S | None |
| 5.2 Yoopta → plain text | P0 | M | None |
| 5.3 Migration path | P1 | S | 5.1, 5.2 |
| 6.1 Plugin architecture | P3 | M | None |
| 6.2 Reusable editor | P3 | M | None |
| 6.3 Bundle size | P2 | S | None |
| 7.1 Unit tests | P1 | M | 1.x, 5.x |
| 7.2 E2E tests | P2 | L | 7.1 |
| 7.3 Error handling | P1 | S | None |
| 8.x API alignment | P1 | M | 1.x, 5.x |

**Legend:** S = Small, M = Medium, L = Large

---

## 10. Success Criteria

- [ ] Scripts load correctly from both `scriptYoopta` and `script`
- [ ] User edits persist via scriptYoopta and survive page reload
- [ ] Generate script shows in editor immediately
- [ ] Switching stories shows correct script per story
- [ ] Read-only mode works (no tools, no edits)
- [ ] `scriptSaved` reflects Yoopta edits
- [ ] `yooptaValueToScriptText` available for export/AI
- [ ] No unused Yoopta packages in bundle
- [ ] Unit tests for conversion and sync logic
- [ ] Error boundary prevents full-page crash on editor error

---

## 11. Appendix: File Reference

| File | Role |
|------|------|
| `frontend/src/components/ScriptEditorYoopta.tsx` | Main editor component |
| `frontend/src/data/editorInitialValue.ts` | Default value, conversion helpers |
| `frontend/src/components/story-detail/StoryDetailScriptSection.tsx` | Script section UI |
| `frontend/src/components/story-detail/types.ts` | StoryBrief, scriptYoopta type |
| `frontend/src/pages/StoryDetail.tsx` | Integration, state, save |
| `src/routes/stories.js` | API, brief persistence |
