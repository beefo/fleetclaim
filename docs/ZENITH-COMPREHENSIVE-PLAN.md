# FleetClaim Zenith Design Comprehensive Improvement Plan

## Executive Summary

After comprehensive review of all components, CSS, and comparison with Zenith Storybook patterns, the Add-In has a solid foundation but several areas need improvement to feel truly native to MyGeotab.

---

## Critical Issues (Must Fix)

### 1. **Stats Cards Pattern is Wrong**
**Current:** Using `Card` with custom `.stat-value` styling
**Zenith Pattern:** Use `<SummaryTile>` components inside `<Layout.SummaryTiles>`

**Impact:** Stats cards look different from native MyGeotab pages like Dashboard.

### 2. **Detail Page Header is Custom**
**Current:** Custom `<div className="report-detail-header">` with buttons
**Zenith Pattern:** Use `<PageHeader>` with `<PageHeader.Actions>`

**Impact:** Header doesn't match the standard MyGeotab page header pattern (e.g., Device Edit, Driver Profile).

### 3. **Form Inputs are Native HTML**
**Current:** `<input className="zen-input">`, `<textarea className="zen-textarea">`
**Zenith Pattern:** Use `<TextInput>`, `<Textarea>`, `<FormField>` components

**Impact:** Form fields don't have proper Zenith styling, focus states, error states.

### 4. **Radio Buttons are Native HTML**
**Current:** Damage assessment uses `<input type="radio">`
**Zenith Pattern:** Use `<RadioGroup>` and `<Radio>` components

### 5. **Photo Viewer Modal is Custom**
**Current:** Custom `.photo-viewer-overlay` div
**Zenith Pattern:** Use `<Modal>` component

### 6. **Toast System is Custom**
**Current:** Custom `ToastContainer` component
**Zenith Pattern:** Use `<FeedbackProvider>` and `<Toast>` or `<Notification>`

### 7. **Empty States Missing Proper Pattern**
**Current:** Simple text in `.empty-photos` div
**Zenith Pattern:** Use `<Table.Empty>` pattern with illustration

---

## Medium Priority Issues

### 8. **Loading States are Inconsistent**
**Current:** Text "Loading..." or spinner emoji
**Zenith Pattern:** Use `<Skeleton>`, `<SkeletonList>`, or `<Waiting>`

### 9. **Action Buttons in Tables**
**Current:** Inline `<Button>` in column
**Zenith Pattern:** Use `<ActionsColumn>` with proper hover actions

### 10. **Info Banners Pattern**
**Current:** `.requests-info` div with icon
**Zenith Pattern:** Use `<Banner>` or `<Alert>` component

### 11. **Tabs Content Padding**
**Current:** `.report-detail-content` has custom padding
**Zenith Pattern:** Use `<Layout.Content>` for proper padding

### 12. **Card Status Indicators**
**Current:** Using `status` prop on Cards (deprecated)
**Zenith Pattern:** Use `iconType` for card status indicators

---

## Low Priority / Polish

### 13. **Missing Icons**
**Current:** Using emoji (📷 📝 🔧 📄 ✉️ 🗑️)
**Zenith Pattern:** Use Zenith icons where available

### 14. **Confirm Dialogs**
**Current:** Using `window.confirm()`
**Zenith Pattern:** Use `<Dialog>` component

### 15. **Dropdown Menus**
**Current:** Action buttons in table columns
**Zenith Pattern:** Consider `<Menu>` for grouped actions

---

## Implementation Tasks by Component

### Task 1: App.tsx - Layout Structure
- Wrap tab content in `<Layout.Content>` instead of custom div
- Consider using `<FeedbackProvider>` for toast management

### Task 2: ReportsTab.tsx - Stats & Table
- Replace `<Cards>` with `<Layout.SummaryTiles>` and `<SummaryTile>`
- Add loading skeleton with `<SkeletonList>` while loading
- Use `<ActionsColumn>` for View button
- Remove deprecated `status` prop from cards

### Task 3: RequestsTab.tsx - Same as ReportsTab
- Replace stats cards with `<SummaryTile>`
- Replace `.requests-info` with `<Banner>`
- Add loading skeleton

### Task 4: ReportDetailPage.tsx - Major Refactor
- Replace header div with `<PageHeader>` + `<PageHeader.Actions>`
- Remove custom title styling, use PageHeader title
- Use `<Layout.Content>` wrapper for tab content
- Consider `<SidePanel>` pattern for mobile responsive design

### Task 5: PhotosSection.tsx
- Replace custom photo viewer with `<Modal>`
- Replace empty state with proper Zenith pattern
- Add `<Skeleton>` for loading thumbnails

### Task 6: DamageAssessmentForm.tsx
- Replace native inputs with `<TextInput>`, `<Textarea>`
- Replace radio buttons with `<RadioGroup>`
- Use `<FormField>` wrappers for proper label/error handling

### Task 7: ThirdPartyInfoForm.tsx
- Replace all native inputs with Zenith components
- Use consistent `<FormField>` structure

### Task 8: SettingsTab.tsx
- Already using `<ToggleButton>` correctly
- Update inputs to use Zenith components

### Task 9: NewRequestModal.tsx
- Audit form fields for Zenith compliance
- Ensure modal footer matches patterns

### Task 10: CSS Cleanup
- Remove custom styles that duplicate Zenith
- Keep only layout-specific overrides
- Remove emoji-based status icons in favor of Zenith icons

---

## Sub-Agent Task Assignments

### Sub-Agent 1: Stats & Summary Tiles
**Files:** `ReportsTab.tsx`, `RequestsTab.tsx`
**Tasks:**
1. Import `SummaryTile`, `SummaryTileType` from Zenith
2. Replace `<Cards>` block with `<Layout.SummaryTiles>` container
3. Replace each stat Card with `<SummaryTile>` using proper `tileType`
4. Remove `.stat-value` CSS (no longer needed)

### Sub-Agent 2: Page Headers
**Files:** `ReportDetailPage.tsx`
**Tasks:**
1. Import `PageHeader` from Zenith
2. Replace custom header div with `<PageHeader>`
3. Move action buttons to `<PageHeader.Actions>`
4. Use back button pattern from Zenith
5. Clean up related CSS

### Sub-Agent 3: Form Components
**Files:** `DamageAssessmentForm.tsx`, `ThirdPartyInfoForm.tsx`
**Tasks:**
1. Import `TextInput`, `Textarea`, `RadioGroup`, `Radio`, `FormField` from Zenith
2. Replace all native `<input>` with `<TextInput>`
3. Replace all native `<textarea>` with `<Textarea>`
4. Replace radio buttons with `<RadioGroup>`
5. Wrap fields in `<FormField>` for proper labels

### Sub-Agent 4: Banners & Alerts
**Files:** `RequestsTab.tsx`, CSS cleanup
**Tasks:**
1. Replace `.requests-info` with `<Banner>` component
2. Ensure all info/warning messages use `<Banner>`
3. Remove related custom CSS

### Sub-Agent 5: Modals & Dialogs
**Files:** `PhotosSection.tsx`
**Tasks:**
1. Replace custom photo viewer overlay with `<Modal>`
2. Add proper Modal header/footer structure
3. Use `<Dialog>` for delete confirmations (if feasible)

### Sub-Agent 6: Loading States
**Files:** All tab components
**Tasks:**
1. Import `Skeleton`, `SkeletonList`, `Waiting` from Zenith
2. Add loading skeleton to ReportsTab
3. Add loading skeleton to RequestsTab
4. Add loading skeleton to photo thumbnails

---

## Zenith Components Reference

### Already Using Correctly ✅
- `Layout`, `Header`, `Header.Title`, `Header.Menu`, `Header.Button`
- `Tabs` (correct props: `tabs`, `activeTabId`, `onTabChange`)
- `Table` with sorting, selection, columns
- `FiltersBar` with Dropdown, Search
- `Card` with `Card.Content`, `Card.Actions`
- `Button` with correct types
- `Pill` for status badges
- `Modal` (in NewRequestModal)
- `Menu`, `Menu.Item`, `Menu.Separator`
- `ToggleButton`
- `Chart`

### Need to Add
- `SummaryTile` / `Layout.SummaryTiles`
- `PageHeader` / `PageHeader.Actions`
- `TextInput`, `Textarea`, `FormField`
- `RadioGroup`, `Radio`
- `Banner` (replacing custom alerts)
- `Skeleton`, `SkeletonList`
- `ActionsColumn` (for table row actions)

### Nice to Have
- `Dialog` (for confirmations)
- `FeedbackProvider` (for toasts)
- `Notification`
- Icon components (replace emoji)

---

## Priority Order

1. **Stats Cards** (highest visual impact, ~30 mins)
2. **Detail Page Header** (consistency, ~45 mins)
3. **Form Components** (proper UX, ~1 hour)
4. **Banners & Alerts** (quick win, ~15 mins)
5. **Photo Modal** (~20 mins)
6. **Loading States** (~30 mins)
7. **Icon Replacement** (~30 mins)

**Total Estimated Time:** ~4 hours

---

## Success Criteria

After implementation, the Add-In should:
1. Use no custom CSS for components that have Zenith equivalents
2. Have consistent loading states across all views
3. Match the look and feel of native MyGeotab pages (Dashboard, Devices, etc.)
4. Use Zenith components for all form inputs
5. Have proper accessibility through Zenith's built-in a11y
6. Feel responsive on mobile (if using Zenith's responsive patterns)
