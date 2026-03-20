# Inconsistencies Audit

> Things that need to be unified. Each section describes the problem, where it occurs, and the recommended fix.
> 
> ✅ = Fixed | ⏳ = Gradual migration | ➖ = Acceptable as-is

---

## 1. Hardcoded Colors

### ✅ `border-[#151619]` — Top bar border

**Fixed:** Replaced with `border-border` across all 17 files (22 occurrences).

---

### ✅ `hover:bg-[#0d0d10]` — Row hover

**Fixed:** Replaced with `hover:bg-card` (background alternative) across 8 files (15 occurrences).

---

### ✅ `bg-[#080808]` — Sidebar / dark surfaces

**Fixed:** Replaced with `bg-sidebar` in AppSidebar.tsx and ProfilePicker.tsx.

---

### ✅ `bg-[#070707]` — Login page background

**Fixed:** Replaced with `bg-sidebar` in Login.tsx.

---

### ✅ `bg-[#111114]`, `bg-[#14141a]`, `bg-[#0c0c10]` — ProfilePicker card surfaces

**Fixed:** Replaced with `bg-card` and `hover:bg-card` in ProfilePicker.tsx.

---

### ✅ `bg-[rgb(30,81,233)]` / `bg-[#1e51e9]` — Blue primary buttons

**Fixed:** Replaced with `bg-primary` / `text-primary` (--primary is now blue). Files: VideoTable, Competitions, ChannelRightPanel.

---

### ✅ `bg-[#FFFF00]/10 text-[#FFFF00]` — Competition channel badge

**Fixed:** Replaced with `bg-orange/10 text-orange` in ChannelRightPanel.tsx.

---

### ✅ `from-[#070707]` — Login gradient stops

**Fixed:** Replaced with `from-background` in Login.tsx (3 instances).

---

### ✅ `bg-[#1e1e2e]` — Script editor floating toolbar

**Fixed:** Replaced with `bg-card` in ScriptEditorTiptap.tsx.

---

### ✅ `ring-[#FFFF00]` — Competition live dot

**Fixed:** Replaced with `ring-orange` in Competitions.tsx.

---

### ✅ `#22c55e` / `#ef4444` — Chart SVG colors

**Fixed:** Replaced with `hsl(var(--success))` and `hsl(var(--destructive))` in ProfileHome.tsx.

---

### ✅ `#1e51e9` — ProfilePicker fallback color & palette

**Fixed:** Default avatar fallback uses `hsl(var(--primary))`. Palette array uses DLS tokens (primary, success, orange, destructive, purple). ProfilePicker.tsx.

---

### ✅ `rgba()` in shadows — MediaGrid, VideoUpload

**Fixed:** Replaced `rgba(...)` with `hsl(...)` in MediaGrid.tsx (3 instances) and VideoUpload.tsx (1 instance).

---

### ➖ `text-[#00d68a]` — Apify brand color

**Kept as-is.** Third-party brand color, only used in Source.tsx.

---

### ➖ Google brand colors in Login.tsx

**Kept as-is.** `#4285F4`, `#34A853`, `#FBBC05`, `#EA4335` are official Google brand colors.

---

### ➖ `fill='%23666'` — SVG data URL placeholders

**Kept as-is.** CSS variables can't be used in data URLs. Value `#666` is close to `--dim` (40% lightness). Used in ProfileHome, ChannelDetail, Competitions.

---

### ➖ `focus:border-[#2a2a2e]` — Input focus border

**Fixed:** Replaced with `focus:border-border` in Competitions.tsx.

---

### ➖ Script block colors (hardcoded hex in CSS variables)

Low priority. They use hardcoded hex but are properly defined as CSS variables scoped to script blocks.

---

### ➖ Collaboration cursor colors

Acceptable. Per-user cursor colors for collaboration don't need to follow the token system.

---

### ➖ Chart component hardcoded colors

Low priority. Third-party element selectors in chart.tsx.

---

## 2. ✅ Page Title Sizes

**Fixed:** Standardized ArticleDetail.tsx to `text-sm font-semibold`. Standalone pages (Login, ProfilePicker, ProfileHome) keep their intentional larger sizes.

---

## 3. ✅ Page Padding

**Fixed:** Standardized ProfileHome.tsx to `px-6 pt-5 pb-8 max-lg:px-4`. Pages with intentional deviations (Gallery toolbar area, Pipeline filter bar) keep their layout-specific padding.

---

## 4. ✅ Border Radius on Dialogs

**Fixed:** AlertDialog now uses `rounded-xl` matching Dialog.

---

## 5. ✅ Separator Background Color

**Fixed:** Replaced `bg-muted` with `bg-border` in dropdown-menu.tsx, menubar.tsx, and select.tsx.

---

## 6. ✅ Loading Spinner Inconsistency

**Fixed:** All 18 CSS border spinners replaced with `<Loader2 className="w-SIZE h-SIZE animate-spin text-muted-foreground" />` across 17 files. The codebase now consistently uses Lucide `Loader2` for all loading indicators.

Files migrated: App.tsx, ChannelLayout.tsx, StoryDetailArticle.tsx, StoryDetailScriptSection.tsx, AlbumDetail.tsx, ArticleDetail.tsx, ArticlePipeline.tsx, ChannelDetail.tsx, Gallery.tsx, Monitor.tsx, Pipeline.tsx (2), ProfileHome.tsx, ProfilePicker.tsx, PublishQueue.tsx, Stories.tsx, VectorIntelligence.tsx, VideoDetail.tsx.

---

## 7. ✅ Empty State Inconsistency

**Fixed:** Created shared `EmptyState` component at `components/ui/empty-state.tsx` with consistent styling:

```tsx
<EmptyState icon={IconName} title="..." description="..." className="..." />
```

Migrated 20+ empty states across 14 files: MediaGrid, AlbumDetail, Gallery, Competitions, Stories, Monitor, Source, PublishQueue, VideoDetail, StoryDetail, VectorIntelligence, ArticleDetail, Settings, ProfileHome.

Remaining empty states in Pipeline.tsx and ArticlePipeline.tsx use specialized Kanban empty patterns and are acceptable as-is.

---

## 8. ✅ Confirmation Dialog Inconsistency

**Fixed:** All destructive confirmations now use `AlertDialog`:

| Before | After | File |
|--------|-------|------|
| `window.confirm()` | AlertDialog | Source.tsx |
| `window.confirm()` | AlertDialog | ChannelRightPanel.tsx |
| `Dialog` for delete | AlertDialog | ProfilePicker.tsx |
| Custom modal overlay | AlertDialog | DeleteChannelModal.tsx |
| Direct delete (no confirm) | AlertDialog confirmation | MediaViewer.tsx |

---

## 9. ⏳ Form State Management

`react-hook-form` and `zod` are installed but unused. All forms use plain `useState`.

**Gradual migration.** New forms should use react-hook-form + zod.

---

## 10. ➖ `Card` Component Not Used

Pages use bare divs with consistent card-like styling. Fine as-is. Adopt `Card` for new features needing header/title/content/footer structure.

---

## 11. ✅ Redundant Inline Styles

**Fixed:** Removed redundant `style={{ borderRadius: '12px' }}` from VideoDetail.tsx (7), VideoTable.tsx (2), and Competitions.tsx (1) where `rounded-xl` already provides the same radius.

---

## 12. ✅ Typos in shadcn Components

**Fixed:**
- `menubar.tsx`: `displayname` → `displayName`
- `breadcrumb.tsx`: `BreadcrumbElipssis` → `BreadcrumbEllipsis`

---

## Priority Summary

| Priority | Issue | Status |
|----------|-------|--------|
| **High** | Hardcoded colors | ✅ Fixed (17 new + 7 prior) |
| **High** | Page title sizes | ✅ Fixed |
| **Medium** | Loading spinner approach | ✅ Fixed (18 spinners → Loader2) |
| **Medium** | Empty state approach | ✅ Fixed (EmptyState component, 20+ migrated) |
| **Medium** | Confirmation dialog approach | ✅ Fixed (5 patterns → AlertDialog) |
| **Medium** | Page padding | ✅ Fixed |
| **Medium** | Dialog border-radius mismatch | ✅ Fixed |
| **Low** | Separator colors | ✅ Fixed |
| **Low** | Form state (react-hook-form) | ⏳ Gradual |
| **Low** | Card component adoption | ➖ OK |
| **Low** | Redundant inline styles | ✅ Fixed |
| **Low** | Typos | ✅ Fixed |
