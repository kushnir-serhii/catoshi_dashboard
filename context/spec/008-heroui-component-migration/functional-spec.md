# Functional Specification: HeroUI Component Migration

- **Roadmap Item:** Phase 3 — UI Polish > HeroUI Component Migration
- **Status:** Draft
- **Author:** Serhii Kushnir

---

## 1. Overview and Rationale (The "Why")

The dashboard UI is built on hand-rolled Tailwind components — custom buttons, inputs, modals, panels, and navigation elements. These work, but they require ongoing maintenance, lack consistent accessibility primitives, and slow down future feature development.

HeroUI (`@heroui/react`) is already installed in the project. It provides a production-ready component library built on React Aria (WCAG-compliant by default) with first-class dark mode and Tailwind CSS v4 support. Migrating to HeroUI for structural UI components removes the maintenance burden of custom primitives and gives every future page a consistent, accessible baseline.

**Recharts is not touched.** All chart components — `HistoricalPriceChart`, `SparklineChart`, `ProjectionChart`, `HoldingsDonut` — stay as-is. HeroUI has no charting story and Recharts handles this well.

**Success looks like:** A developer adding a new dashboard page reaches for HeroUI components first and never needs to write a custom button, input, or modal from scratch. Existing pages look visually consistent and behave identically to before the migration.

---

## 2. Functional Requirements (The "What")

### 2.1 Button and Link Primitives

The custom `ButtonOrLink` component in `src/components/ui/ButtonOrLink.tsx` is replaced with HeroUI's `Button` and Next.js `Link` used directly. All call sites are updated.

**Acceptance Criteria:**
- [ ] `ButtonOrLink` is removed; no file in the project imports it after migration.
- [ ] All interactive buttons across the dashboard use HeroUI `Button` with the appropriate `variant` and `color` props.
- [ ] Navigation links that were rendered by `ButtonOrLink` use Next.js `Link` directly, styled via HeroUI's `link` variant or `className`.
- [ ] Visual appearance of all buttons is consistent with the dark theme.

---

### 2.2 Search Input

The custom `InputSearch` component is replaced with HeroUI's `Input` component configured with a search icon slot.

**Acceptance Criteria:**
- [ ] `InputSearch` is removed; no file imports it after migration.
- [ ] The search input in the navigation renders correctly with the same placeholder text and icon.
- [ ] Keyboard focus, clear, and submit behaviour works identically to before.

---

### 2.3 Theme Toggle Button

The custom `ThemeToggleButton` component is replaced with a HeroUI `Button` (icon variant) wired to the existing theme state.

**Acceptance Criteria:**
- [ ] `ThemeToggleButton` is removed; no file imports it after migration.
- [ ] Dark/light mode toggle continues to work correctly.
- [ ] The button visually matches the surrounding navigation elements.

---

### 2.4 Forecast Settings Modal

The custom modal in `ForecastSettingsModal.tsx` is rebuilt using HeroUI's `Modal`, `ModalContent`, `ModalHeader`, `ModalBody`, and `ModalFooter` components.

**Acceptance Criteria:**
- [ ] The modal opens and closes correctly from its existing trigger.
- [ ] All forecast setting controls (service selector, model selector, confirm button) are present and functional inside the HeroUI modal shell.
- [ ] The modal is keyboard-dismissible (Escape key) and focus-trapped while open.
- [ ] Backdrop click closes the modal.

---

### 2.5 Panel Cards

Panels in `src/components/panels/` (`AIPanel`, `WatchlistPanel`, `HoldingsPanel`, `SignalsPanel`, `ScenarioPanel`, `ChartPanel`, `KPIs`) are wrapped with HeroUI's `Card` and `CardBody` as the outer shell, replacing hand-rolled `div` containers.

**Acceptance Criteria:**
- [ ] Each panel renders inside a HeroUI `Card` shell.
- [ ] Panel content (charts, lists, KPI values) is unchanged and fully visible.
- [ ] Panels respect the existing `--surface-*` CSS variable theming.

---

### 2.6 Navigation Shell

`DashboardShell.tsx` and `Navigation.tsx` use HeroUI's `Navbar`, `NavbarBrand`, `NavbarContent`, and `NavbarItem` to structure the top navigation bar.

**Acceptance Criteria:**
- [ ] The top navigation renders brand logo, page links, and user menu correctly.
- [ ] Active page link is visually distinguished.
- [ ] Navigation is responsive and does not overflow on narrower viewports.

---

## 3. Scope and Boundaries

### In-Scope

- Replacing `ButtonOrLink`, `InputSearch`, `ThemeToggleButton` with HeroUI equivalents.
- Rebuilding `ForecastSettingsModal` on HeroUI `Modal`.
- Wrapping panel components with HeroUI `Card`.
- Restructuring `DashboardShell` and `Navigation` with HeroUI `Navbar`.

### Out-of-Scope

- **Chart components** — `HistoricalPriceChart`, `SparklineChart`, `charts.tsx` (`ProjectionChart`, `HoldingsDonut`), `ChartPanel` internals — all Recharts code is untouched.
- **Data hooks** — no changes to `src/hooks/`, `src/lib/`, or `src/app/api/`.
- **Page logic** — the pages themselves (`ProjectionsPage`, `MarketsPage`, `PortfolioPage`, `SignalsPage`, `ModelsPage`) are unchanged beyond any import updates.
- **Landing page** — `LandingPage.tsx` is out of scope for this migration.
- **New features** — this is a pure component replacement; no new functionality is added.
- **Mobile app** — web-only per the overall product scope.
