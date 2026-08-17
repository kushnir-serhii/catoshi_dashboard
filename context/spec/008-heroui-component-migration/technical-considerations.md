# Technical Specification: HeroUI Component Migration

- **Functional Specification:** [context/spec/008-heroui-component-migration/functional-spec.md](./functional-spec.md)
- **Status:** Draft
- **Author(s):** Serhii Kushnir

---

## 1. High-Level Technical Approach

HeroUI (`@heroui/react ^3.2.1`) is already installed. The migration is incremental: each component is replaced one-by-one in isolated slices with no cross-slice dependencies. Recharts chart components are explicitly excluded from every slice.

HeroUI v3 uses a `heroui()` Tailwind plugin for its design tokens. This must be added to `tailwind.config.ts` (or the PostCSS config for Tailwind v4) before any HeroUI component can render correctly. That plugin registration is the single prerequisite for all other slices.

The existing `cn()` utility (`src/utils/cn.ts`) wraps `clsx` + `tailwind-merge` and is compatible with HeroUI's `classNames` prop pattern — no changes needed there.

**Affected files:**
- Modified: `tailwind.config.ts` (or PostCSS setup) — add `heroui()` plugin
- Deleted: `src/components/ui/ButtonOrLink.tsx`
- Deleted: `src/components/ui/InputSearch.tsx`
- Deleted: `src/components/ui/ThemeToggleButton.tsx`
- Modified: all call sites of the above three components
- Modified: `src/components/dashboard/ForecastSettingsModal.tsx`
- Modified: `src/components/panels/AIPanel.tsx`, `WatchlistPanel.tsx`, `HoldingsPanel.tsx`, `SignalsPanel.tsx`, `ScenarioPanel.tsx`, `ChartPanel.tsx`, `KPIs.tsx`
- Modified: `src/components/dashboard/DashboardShell.tsx`
- Modified: `src/components/common/Navigation.tsx`

---

## 2. Proposed Solution & Implementation Plan

### 2.1 Prerequisite: HeroUI Provider + Tailwind Plugin

HeroUI requires a `HeroUIProvider` wrapper at the app root and the `heroui()` plugin registered in Tailwind.

**`src/app/(admin)/layout.tsx`** — wrap children with `<HeroUIProvider>`.

**Tailwind config** — add `heroui()` to the plugins array. For Tailwind v4 with PostCSS, this goes in `postcss.config.mjs` or `tailwind.config.ts` depending on project setup. Verify with `npx tsc --noEmit` after.

**CSS variables** — HeroUI injects its own design tokens. Verify they do not conflict with the existing `--surface-*`, `--text-*`, `--line-*`, `--glow` variables in `src/app/styles/globals.css`. Override any conflicting tokens in the `:root` block.

---

### 2.2 Slice 1 — Primitive UI Components

Replace `ButtonOrLink`, `InputSearch`, `ThemeToggleButton`.

**`ButtonOrLink`** — call sites split into two patterns:
- Pure buttons (`onClick` only) → `<Button>` from HeroUI with `variant="ghost"` or `variant="light"`.
- Navigation links (`href`) → Next.js `<Link>` with HeroUI `Button` as `as` prop, or HeroUI's `Link` component.

**`InputSearch`** — replaced with HeroUI `<Input type="search" startContent={<SearchIcon />} />`. The `SearchIcon` is an inline SVG or Heroicons icon already used in the project.

**`ThemeToggleButton`** — replaced with `<Button isIconOnly variant="light" onPress={toggleTheme}>` containing the existing sun/moon SVG.

---

### 2.3 Slice 2 — Forecast Settings Modal

**File:** `src/components/dashboard/ForecastSettingsModal.tsx`

Replace the custom modal shell with:
```
<Modal isOpen={isOpen} onOpenChange={onOpenChange}>
  <ModalContent>
    <ModalHeader>Forecast Settings</ModalHeader>
    <ModalBody>
      {/* existing service/model selectors unchanged */}
    </ModalBody>
    <ModalFooter>
      {/* existing confirm/cancel buttons as HeroUI Button */}
    </ModalFooter>
  </ModalContent>
</Modal>
```

HeroUI `Modal` handles focus trap, Escape dismiss, and backdrop click natively — remove all manual event handlers for those behaviours.

The `useDisclosure` hook from HeroUI manages `isOpen` / `onOpenChange` state — replace the existing boolean `useState` with it.

---

### 2.4 Slice 3 — Panel Cards

Each panel component in `src/components/panels/` gets its outermost `<div className="...surface...">` replaced with:
```
<Card className="bg-[--surface-1] border-[--line-1]">
  <CardBody>
    {/* existing panel content unchanged */}
  </CardBody>
</Card>
```

Use `classNames` prop on `Card` to thread through the existing CSS variable references rather than hardcoding colors. HeroUI `Card` is unstyled enough that overriding its background with a CSS variable is straightforward.

**ChartPanel** — the `Card` wraps the panel shell only; the Recharts `ResponsiveContainer` and chart components inside are not touched.

---

### 2.5 Slice 4 — Navigation Shell

**Files:** `src/components/dashboard/DashboardShell.tsx`, `src/components/common/Navigation.tsx`

Replace the top nav `<header>` / `<nav>` structure with:
```
<Navbar>
  <NavbarBrand><CatLogo /></NavbarBrand>
  <NavbarContent>
    {/* page links as NavbarItem + Link */}
  </NavbarContent>
  <NavbarContent justify="end">
    {/* UserMenu, ThemeToggle */}
  </NavbarContent>
</Navbar>
```

The `isMenuOpen` / `onMenuOpenChange` pattern from HeroUI `Navbar` replaces any existing mobile menu state if present.

Active link detection continues to use Next.js `usePathname()` — pass `isActive` to the HeroUI `Link` `aria-current` prop.

---

## 3. Impact and Risk Analysis

### System Dependencies
- No data hooks, Route Handlers, or server-side code is touched.
- Chart components (`charts.tsx`, `HistoricalPriceChart.tsx`, `SparklineChart.tsx`) are explicitly excluded.
- The `DashboardContext` glow state is UI-only and unaffected.

### Potential Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| HeroUI CSS tokens conflict with existing `--surface-*` variables | Medium | Audit `:root` in `globals.css` after adding plugin; override conflicting tokens |
| HeroUI `Modal` z-index conflicts with existing overlays | Low | Set `classNames={{ backdrop: 'z-40', wrapper: 'z-50' }}` if conflict occurs |
| `HeroUIProvider` not wrapping server components correctly in App Router | Low | Place provider in a `'use client'` layout wrapper, not a server component |
| Tailwind v4 PostCSS plugin registration differs from v3 pattern | Medium | Test plugin registration in isolation before migrating any component |
| Visual regression on panels from HeroUI Card default padding | Low | Use `classNames={{ body: 'p-0' }}` on Card and manage padding in panel content |

---

## 4. Testing Strategy

- **Visual regression:** Screenshot each affected page before and after each slice. Confirm no layout shifts on Projections, Markets, Portfolio, Signals, and Models pages.
- **Modal:** Verify Escape key closes, backdrop click closes, focus is trapped inside, and all form controls inside are reachable by keyboard.
- **Navigation:** Verify active link styling on each page; verify brand logo routes to `/`.
- **Type check:** Run `npx tsc --noEmit` after each slice — zero errors required before moving to the next slice.
- **Mock data mode:** Run with `NEXT_PUBLIC_USE_MOCK_DATA=true` and verify all panels still render without data errors.
