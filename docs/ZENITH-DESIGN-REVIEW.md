# FleetClaim Zenith Design Review

## Research Summary

After reviewing the Geotab Zenith Storybook (v1.26.x) and comparing with our current FleetClaim Add-In design, here are the key findings and recommendations.

---

## Components We're Using Well ✅

1. **Layout + Header** - Proper structure with `<Layout>`, `<Header>`, `<Header.Title>`, `<Header.Menu>`, `<Header.Button>`
2. **Tabs** - Using correct `tabs`, `activeTabId`, `onTabChange` props
3. **Cards** - Using `<Card>` with `<Card.Content>` subcomponents
4. **Table** - Using proper column definitions with sorting
5. **FiltersBar** - For date range and filters
6. **Pill** - For severity badges
7. **Button** - With correct types (primary, secondary, tertiary)
8. **Chart** - For speed profile visualization
9. **Modal** - For new request form

---

## Design Improvements Recommended

### 1. Use `SummaryTile` for Key Metrics
**Current:** Custom `.metrics-grid` with divs  
**Zenith Way:** Use `<SummaryTile>` component with `tileType` for color coding

```tsx
import { SummaryTile, SummaryTileType } from '@geotab/zenith';

<SummaryTile
    title="Event Speed"
    tileType={SummaryTileType.Warning}
    size="medium"
>
    72 km/h
</SummaryTile>
```

### 2. Use `Layout.SummaryTiles` for Stats Bar
**Current:** Custom stats cards at top of Reports tab  
**Zenith Way:** Use `<Layout.SummaryTiles>` container

```tsx
<Layout.SummaryTiles>
    <SummaryTile title="Total Reports" tileType={SummaryTileType.Default}>
        {stats.total}
    </SummaryTile>
    <SummaryTile title="Critical" tileType={SummaryTileType.Error}>
        {stats.critical}
    </SummaryTile>
</Layout.SummaryTiles>
```

### 3. Use `Alert` or `Banner` for Notices
**Current:** Custom `.baseline-notice` div  
**Zenith Way:** Use `<Banner>` or `<Alert>` component

```tsx
import { Banner } from '@geotab/zenith';

<Banner type="info" header="Baseline Report">
    This report was generated manually without a collision event trigger.
</Banner>
```

### 4. Use `List` for Form Rows
**Current:** Custom `.form-rows` with flexbox  
**Zenith Way:** Could use `<List>` component for structured data display

### 5. Use `Toast` Component Instead of Custom
**Current:** Custom `ToastContainer` component  
**Zenith Way:** Use Zenith's `<Toast>` or integrate with `FeedbackProvider`

```tsx
import { Toast, FeedbackProvider } from '@geotab/zenith';
```

### 6. Use `PageHeader` for Detail Page Header
**Current:** Custom `.report-detail-header` div  
**Zenith Way:** Use `<PageHeader>` with `<PageHeader.Actions>` and `<PageHeader.Filters>`

### 7. Use `TextInput` and `Textarea` Components
**Current:** Raw `<textarea>` element  
**Zenith Way:** Use Zenith's `<Textarea>` component

```tsx
import { Textarea } from '@geotab/zenith';

<Textarea
    placeholder="Enter notes..."
    value={notes}
    onChange={(e) => setNotes(e.target.value)}
/>
```

### 8. Use `Dropdown` Instead of Native `<select>`
**Current:** `<select className="zen-select">`  
**Zenith Way:** Use `<Dropdown>` component

```tsx
import { Dropdown } from '@geotab/zenith';

<Dropdown
    options={vehicleOptions}
    value={selectedVehicle}
    onChange={setSelectedVehicle}
    placeholder="Select vehicle"
/>
```

### 9. Use `Toggle` for Boolean Settings
**Current:** `<ToggleButton>`  
**Zenith Way:** This is correct! `<ToggleButton>` is the right component.

### 10. Use `DataGrid` for Better Table Layout
**Current:** Basic `Table` component  
**Zenith Way:** For complex data, consider `<DataGrid>` which provides more features

### 11. Use `Skeleton` for Loading States
**Current:** "Loading..." text or spinner icons  
**Zenith Way:** Use `<Skeleton>` or `<SkeletonList>` for proper loading states

```tsx
import { Skeleton, SkeletonList } from '@geotab/zenith';

{isLoading && <SkeletonList count={5} />}
```

### 12. Use Proper Icon Components
**Current:** Using emoji (📄 📍 👤) in some places  
**Zenith Way:** Use Zenith icon components where possible

Available icons:
- `IconCheck`, `IconWarning`, `IconCloseCircle`, `IconLoader`
- `IconChevronLeft`, `IconChevronRight`
- `IconSettings3`, etc.

---

## Spacing & Layout Improvements

### Card Spacing
Zenith uses consistent spacing:
- Card padding: 16px (matches our current)
- Gap between cards: 16px
- Form row padding: 12px vertically

### Two-Column Layout
Our implementation is good! Using CSS Grid with proper breakpoints.
- Consider adding `fullHeight` prop to cards where needed

### Font Sizes
- Title: 16px, weight 600
- Label: 14px, color secondary
- Value: 14px, color primary
- Hint text: 12px, color tertiary

---

## Color Usage

Zenith provides CSS variables:
- `--zen-color-error` (#ef4444) - Critical
- `--zen-color-warning` (#f59e0b) - High
- `--zen-color-success` (#22c55e) - Low
- `--zen-color-info` (#3b82f6) - Medium/Info
- `--zen-color-text-primary` - Main text
- `--zen-color-text-secondary` - Labels
- `--zen-color-border` - Borders
- `--zen-color-surface-secondary` - Card backgrounds

---

## Priority Implementation Order

### Phase 1: Quick Wins (Low Risk)
1. Replace native `<select>` with `<Dropdown>`
2. Replace native `<textarea>` with `<Textarea>` 
3. Add `<Skeleton>` loading states
4. Replace emoji with icons where Zenith icons exist

### Phase 2: Component Upgrades (Medium)
1. Use `<SummaryTile>` for metrics grid
2. Use `<Banner>` for notices
3. Use `<PageHeader>` for detail page header
4. Integrate Zenith `<Toast>` system

### Phase 3: Advanced (Larger Refactor)
1. Use `<DataGrid>` instead of basic `<Table>`
2. Implement `<FeedbackProvider>` for global notifications
3. Add `<SidePanel>` for mobile-responsive detail views

---

## Current Design Strengths

1. ✅ Proper use of `Layout` component structure
2. ✅ Correct `Tabs` implementation
3. ✅ Good Card hierarchy with Content/Actions
4. ✅ Two-column layout matching Device Edit style
5. ✅ Consistent use of Zenith CSS variables
6. ✅ Proper button type usage (primary/secondary/tertiary)
7. ✅ FiltersBar with proper dropdown integration
8. ✅ Table with sorting and selection

---

## Files to Update

- `ReportDetailPage.tsx` - Add SummaryTile, Banner, PageHeader
- `ReportsTab.tsx` - Add Layout.SummaryTiles, Skeleton
- `PhotosSection.tsx` - Replace native select with Dropdown
- `DamageAssessmentForm.tsx` - Use Zenith form components
- `ThirdPartyInfoForm.tsx` - Use Zenith form components
- `ToastContainer.tsx` - Migrate to Zenith Toast
- `app.css` - Clean up custom styles that duplicate Zenith

---

## Resources

- Storybook: https://developers.geotab.com/zenith-storybook/
- Zenith NPM: @geotab/zenith (v1.26.x)
- Type definitions: node_modules/@geotab/zenith/dist/*.d.ts
