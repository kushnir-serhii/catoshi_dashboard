# Task List: HeroUI Component Migration

- **Spec:** `context/spec/008-heroui-component-migration/functional-spec.md`
- **Technical Spec:** `context/spec/008-heroui-component-migration/technical-considerations.md`
- **Status:** Ready

---

## Slice 0: Prerequisite — HeroUI Provider and Tailwind Plugin

- [ ] Add `heroui()` plugin to Tailwind/PostCSS config. **[Agent: nextjs-fullstack]**
- [ ] Wrap `src/app/(admin)/layout.tsx` children in `<HeroUIProvider>` (client boundary). **[Agent: nextjs-fullstack]**
- [ ] Audit `src/app/styles/globals.css` `:root` block — identify and override any HeroUI token conflicts with `--surface-*`, `--text-*`, `--line-*`, `--glow`. **[Agent: nextjs-fullstack]**
- [ ] Verify: run `npx tsc --noEmit` — zero errors. Start dev server and confirm the dashboard loads without console errors. **[Agent: nextjs-fullstack]**

---

## Slice 1: Primitive UI Components — Button, Input, ThemeToggle

- [ ] Replace `src/components/ui/ButtonOrLink.tsx` call sites: pure-button usages → HeroUI `<Button>`; link usages → Next.js `<Link>` with HeroUI `Button` as `as` prop. **[Agent: nextjs-fullstack]**
- [ ] Delete `src/components/ui/ButtonOrLink.tsx`. **[Agent: nextjs-fullstack]**
- [ ] Replace `src/components/ui/InputSearch.tsx` with HeroUI `<Input type="search" startContent={...} />` at all call sites. **[Agent: nextjs-fullstack]**
- [ ] Delete `src/components/ui/InputSearch.tsx`. **[Agent: nextjs-fullstack]**
- [ ] Replace `src/components/ui/ThemeToggleButton.tsx` with HeroUI `<Button isIconOnly variant="light">` containing existing sun/moon SVG. **[Agent: nextjs-fullstack]**
- [ ] Delete `src/components/ui/ThemeToggleButton.tsx`. **[Agent: nextjs-fullstack]**
- [ ] Verify: run `npx tsc --noEmit` — zero errors. Check all buttons and the search input render correctly on the Markets and Projections pages. **[Agent: nextjs-fullstack]**

---

## Slice 2: Forecast Settings Modal

- [ ] Replace the custom modal shell in `src/components/dashboard/ForecastSettingsModal.tsx` with HeroUI `Modal` / `ModalContent` / `ModalHeader` / `ModalBody` / `ModalFooter`. **[Agent: nextjs-fullstack]**
- [ ] Replace the existing boolean `useState` for open state with HeroUI `useDisclosure`. **[Agent: nextjs-fullstack]**
- [ ] Remove any manual Escape-key and backdrop-click handlers (HeroUI handles these natively). **[Agent: nextjs-fullstack]**
- [ ] Verify: open the Forecast Settings modal on the Projections page — service/model selectors work, Escape closes it, backdrop click closes it, focus is trapped inside. Run `npx tsc --noEmit`. **[Agent: nextjs-fullstack]**

---

## Slice 3: Panel Cards

- [ ] In `src/components/panels/AIPanel.tsx`: replace outermost div with HeroUI `<Card>` + `<CardBody>`. Use `classNames` to pass `--surface-1` and `--line-1` CSS variables. **[Agent: nextjs-fullstack]**
- [ ] Repeat for `WatchlistPanel.tsx`, `HoldingsPanel.tsx`, `SignalsPanel.tsx`, `ScenarioPanel.tsx`, `KPIs.tsx`. **[Agent: nextjs-fullstack]**
- [ ] In `src/components/panels/ChartPanel.tsx`: wrap panel shell with HeroUI `Card`; do NOT touch the Recharts `ResponsiveContainer` or any chart component inside. **[Agent: nextjs-fullstack]**
- [ ] Verify: reload the Portfolio and Projections pages — all panels render with correct background, border, and padding. Chart panels show charts unchanged. Run `npx tsc --noEmit`. **[Agent: nextjs-fullstack]**

---

## Slice 4: Navigation Shell

- [ ] Replace the top `<header>` / `<nav>` in `src/components/common/Navigation.tsx` with HeroUI `<Navbar>` / `<NavbarBrand>` / `<NavbarContent>` / `<NavbarItem>`. **[Agent: nextjs-fullstack]**
- [ ] Retain active link detection via `usePathname()`; pass result to HeroUI `Link` `aria-current` prop. **[Agent: nextjs-fullstack]**
- [ ] Update `src/components/dashboard/DashboardShell.tsx` to use the updated `Navigation` component (adjust any wrapper divs if needed). **[Agent: nextjs-fullstack]**
- [ ] Verify: navigate between Projections, Markets, Portfolio, Signals, and Models pages — active link is highlighted on each; brand logo routes to `/projections`; UserMenu renders correctly. Run `npx tsc --noEmit`. **[Agent: nextjs-fullstack]**
