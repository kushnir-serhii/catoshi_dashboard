# Free Next.js Admin Dashboard

A modern and responsive Admin Dashboard built with Next.js 16, React 19,
and Tailwind CSS 4. Includes chart. This project can be used as a starter template
for admin panels, analytics dashboards, CRM systems, or internal tools.

## Features

-   Built with Next.js 16 (App Router)
-   Uses React 19 and TypeScript
-   Tailwind CSS 4 for styling
-   ApexCharts and Recharts for data visualization
-   FullCalendar with multiple views (day, week, month)
-   React DnD for drag and drop interactions
-   React Dropzone for file uploading
-   Vector maps using react-jvectormap
-   Flatpickr for date and time selection
-   Swiper slider integration
-   Preconfigured ESLint and Prettier
-   Fully responsive layout

## Technologies Used

**Frontend Framework** - Next.js 16 - React 19 - TypeScript

**Styling** - Tailwind CSS 4 - clsx - tailwind-merge

**Charts and Visualization** - ApexCharts - Recharts - FullCalendar -
React JVectorMap

**UI Utilities** - Flatpickr - React Dropzone - Swiper - React DnD

**Tooling** - ESLint - Prettier - PostCSS - TypeScript

## Getting Started

### Requirements

-   Node.js 18 or newer
-   npm, pnpm, or yarn

### Installation

``` bash
npm install
```

### Development

``` bash
npm run dev
```

Open the app in your browser:

    http://localhost:3000

## Build for Production

``` bash
npm run build
```

To start the production server:

``` bash
npm start
```

## Project Scripts

  Script                 Description
  ---------------------- ----------------------------
  npm run dev            Start development server
  npm run build          Build for production
  npm start              Start production server
  npm run lint           Run ESLint
  npm run format         Format code using Prettier
  npm run format:check   Check formatting

## Scheduled Data Collection

`.github/workflows/collect.yml` calls `/api/collect` hourly to populate the
Neon `snapshots` table (spec 010). A daily `vercel.json` cron is a fallback
if that schedule ever lapses. Two things can quietly stop this without
either workflow reporting a failure:

-   **GitHub Actions disables scheduled workflows after 60 days without any
    repository activity.** Any commit (to any branch) resets the clock. If
    collection appears to have stopped, check whether the workflow shows as
    disabled under the repo's Actions tab before assuming a bug in the code.
-   **Neon's free plan meters compute at 100 CU-h per project per month.**
    Hourly collection uses roughly 15 CU-h of that budget — comfortable
    headroom on its own, but a runaway analytical query elsewhere against
    the same project is the realistic way to exhaust it and stall writes for
    the rest of the month.

## License

This project is free to use and modify.
