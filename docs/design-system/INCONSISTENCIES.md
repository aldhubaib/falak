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

### ➖ `text-[#00d68a]` — Apify brand color

**Kept as-is.** Third-party brand color, only used in Source.tsx.

---

### ✅ `focus:border-[#2a2a2e]` — Input focus border

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

## 6. Loading Spinner Inconsistency

Two spinner approaches exist:
- CSS spinner (`border-2 border-sensor border-t-transparent rounded-full animate-spin`)
- Lucide `Loader2` (`animate-spin text-dim`)

⏳ **Gradual migration.** Standardize on `Loader2` for new code. Existing CSS spinners can be migrated over time.

---

## 7. Empty State Inconsistency

Different heights, font sizes, and approaches across pages.

⏳ **Gradual migration.** Create a shared `EmptyState` component for new features. Existing empty states can be migrated over time.

---

## 8. Confirmation Dialog Inconsistency

| Approach | Files |
|----------|-------|
| `AlertDialog` (correct) | StoryDetailTopBar |
| `Dialog` (for delete) | ProfilePicker, AppSidebar |
| Custom modal overlay | DeleteChannelModal |
| `window.confirm()` | Source, ChannelRightPanel |

⏳ **Gradual migration.** Use `AlertDialog` for all destructive confirmations in new code. Replace `window.confirm()` calls over time.

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
| **High** | Hardcoded colors | ✅ Fixed |
| **High** | Page title sizes | ✅ Fixed |
| **Medium** | Page padding | ✅ Fixed |
| **Medium** | Loading spinner approach | ⏳ Gradual |
| **Medium** | Empty state approach | ⏳ Gradual |
| **Medium** | Confirmation dialog approach | ⏳ Gradual |
| **Medium** | Dialog border-radius mismatch | ✅ Fixed |
| **Low** | Separator colors | ✅ Fixed |
| **Low** | Form state (react-hook-form) | ⏳ Gradual |
| **Low** | Card component adoption | ➖ OK |
| **Low** | Redundant inline styles | ✅ Fixed |
| **Low** | Typos | ✅ Fixed |
