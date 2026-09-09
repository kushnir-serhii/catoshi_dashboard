# Functional Specification: Real Watchlist With Live Data

- **Roadmap Item:** Phase 3 — An Honest Product > Stop Showing Unmeasured Numbers
- **Status:** Completed
- **Author:** Serhii Kushnir

---

## 1. Overview and Rationale (The "Why")

The watchlist strip on the Projections screen is the last surface in the product that
shows numbers nobody measured. Every price, every daily change, every projection and
every confidence bar in it is fixed text that was written once and never changes. The
small trend line in each row is a decorative squiggle, not a price history. Three of the
six coins listed there are not followed by the product at all.

A visitor cannot tell any of this apart from the rest of the screen. The strip sits
directly beside the projection chart, the scenario panel and the signals feed, all of
which are real. It borrows their credibility and spends it on invented figures. Bitcoin
has read the same price on that strip for months.

This is the exact failure the product promises not to commit: every number on the screen
is either measured or explicitly labelled as absent. Fixing it also removes a second
broken promise — a "Manage list" button that does nothing when clicked.

Alongside making the numbers real, this change turns the strip into an actual watchlist.
The user chooses which coins appear, searching for any coin the price source knows. Coins
the product forecasts show a projection. Coins it does not forecast show live price data
and say plainly that there is no projection for them, rather than inventing one.

**Success looks like:** a user opens Projections, sees their own chosen coins with prices
that match what they would find anywhere else, watches those prices move on their own,
and can point at any figure on the strip and be told where it came from — or be told the
product does not have it.

**How we will measure it:** no figure on the strip is a fixed value; the prices match the
live market; and the strip's stated age is the true age of the data behind it.

---

## 2. Functional Requirements (The "What")

### 2.1 Live Prices, Daily Change and Trend

Every row on the strip shows real market data for that coin: the current price in US
dollars, the percentage change over the past 24 hours, and a small trend line covering
the past 7 days. Positive daily changes are shown in green, negative in red. The trend
line is green when the coin is higher than it was 7 days ago and red when it is lower.

The prices and daily changes refresh on their own every 60 seconds, with no action from
the user. The trend lines are drawn when the screen opens and stay as they are until the
page is reloaded.

**Acceptance Criteria:**

- [x] Every price shown on the strip matches the coin's current market price.
- [x] Leaving the screen open for two minutes changes at least one price without any click.
- [x] The daily change is green for a coin that has risen and red for one that has fallen.
- [x] Each row's trend line traces that coin's real movement over the past 7 days.
- [x] The trend line is green when the coin is above its price of 7 days ago, red when below.
- [x] Reloading the page twice within a minute produces the same trend shape for the same coin.

---

### 2.2 Projection and Confidence

For a coin the product forecasts, the Projection column shows the most recently saved
forecast for that coin — how far the price is expected to move — and the Confidence
column shows how sure that forecast was, drawn as a bar. Opening the screen never asks for
a new forecast and never costs anything; the strip only shows what has already been
produced.

For any other coin, the Projection cell reads as a dash. Hovering the dash explains that
the coin is not forecast, so its row is price information only. The Confidence bar is
empty for that row.

**Acceptance Criteria:**

- [x] Bitcoin, Ethereum and Solana each show a projection figure and a confidence bar.
- [x] The projection shown for a coin matches the projection shown on the main chart for that same coin.
- [x] A coin added by the user that the product does not forecast shows a dash in the Projection column.
- [x] Hovering that dash reveals a short explanation that the coin is not forecast.
- [x] Opening the Projections screen repeatedly does not change the projection figures and does not cause any forecast to be produced.
- [x] A coin whose forecast has not yet been produced shows the dash rather than a made-up number.

---

### 2.3 Choosing Which Coins Appear

The strip opens, for a first-time visitor, showing Bitcoin, Ethereum and Solana. The
"Manage list" button opens a way to change that list.

The user can search for any coin by name or symbol, using the same search they already use
on the historical chart, and add it to the strip. They can also remove any coin, including
the three it starts with. The strip holds at most 10 coins; once 10 are on the list,
adding is unavailable until the user removes one, and the reason is stated on screen.

If the user removes every coin, the strip shows a short line inviting them to add one,
rather than an empty table.

The chosen list is remembered on the user's own device and comes back on their next visit
in the same browser. No account is involved and nothing about the list leaves their
machine. A user opening the product in a different browser sees the starting three again.

**Acceptance Criteria:**

- [x] A first-time visitor sees exactly Bitcoin, Ethereum and Solana on the strip.
- [x] Clicking "Manage list" opens a way to add and remove coins.
- [x] Searching for a coin by name shows matching coins, and picking one adds a row for it.
- [x] The newly added row shows that coin's real price, daily change and 7-day trend.
- [x] Removing a coin, including Bitcoin, removes its row immediately.
- [x] Closing the browser and reopening the product shows the same list the user left.
- [x] With 10 coins on the list, adding another is unavailable and the screen says why.
- [x] Removing all coins shows a short invitation to add one, not a blank table.
- [x] Opening the product in a different browser shows the starting three coins.

---

### 2.4 Heading and Data Age

The strip is titled "Watchlist". Beneath or beside the title, a short line states how old
the displayed prices are, worded the same way as the freshness note used elsewhere in the
product. The old "60-day projection" wording is removed, because rows can now legitimately
carry no projection.

**Acceptance Criteria:**

- [x] The strip's title reads "Watchlist" with no projection horizon in it.
- [x] A line near the title states the age of the prices on screen.
- [x] That stated age increases as time passes and resets after each automatic refresh.
- [x] The stated age matches the freshness wording used on the other screens.

---

### 2.5 Loading State

When the screen first opens and no data has arrived yet, the strip shows animated
placeholder rows in place of real content — one per coin on the user's list — matching how
the rest of the dashboard behaves while loading. Placeholder rows are replaced with real
values as soon as the first data arrives.

**Acceptance Criteria:**

- [x] On first open, the strip shows animated placeholder rows, one per coin on the list.
- [x] No number, trend line or bar is visible while the placeholders are showing.
- [x] Placeholders are replaced by real values as soon as data arrives.
- [x] A newly added coin shows a placeholder row until its own data arrives.

---

### 2.6 Stale or Failed Data

If prices cannot be refreshed within the expected window, the last known values stay on
screen and a visible stale warning appears on the strip, alongside the true age of what is
shown. The strip never goes blank and never silently keeps showing old numbers as if they
were current. The warning disappears as soon as a refresh succeeds.

**Acceptance Criteria:**

- [x] When refreshing fails, the previously shown values remain visible.
- [x] A visible stale warning appears on or near the strip while data is overdue.
- [x] The age shown next to the warning is the true age of the displayed prices.
- [x] The warning disappears once a refresh succeeds.
- [x] The strip never shows an empty table because of a failed refresh.

---

### 2.7 Nothing Fixed Remains

Every value the strip shows comes from a measurement or is shown as absent. No coin name,
price, change, trend, projection or confidence level is written into the product as a
fixed value any more, other than the three coins the strip starts with.

**Acceptance Criteria:**

- [x] Searching the product for the fixed watchlist figures that exist today returns nothing.
- [x] Chainlink, Arbitrum and Bittensor no longer appear on the strip unless a user adds them.
- [x] With the internet disconnected, the strip shows placeholders or the stale warning, never numbers.

---

### 2.8 Trend Lines on the Market Summary Cards

The summary cards at the top of the Markets screen show each coin's price and daily
change but no trend line at all. They gain the same 7-day trend line the rows on the
watchlist and the Markets table already use, reading from the same data those screens
already have.

A card whose trend data has not arrived shows no line, rather than a placeholder shape.

**Acceptance Criteria:**

- [x] Each summary card on the Markets screen shows a small 7-day trend line.
- [x] A card's trend line matches the trend line for the same coin in the table below it.
- [x] A card with no trend data available shows no line at all, never a decorative shape.

---

## 3. Scope and Boundaries

### In-Scope

- Real, automatically refreshing prices and daily changes on the Projections watchlist strip.
- Real 7-day trend lines per row, replacing the decorative squiggles.
- Projection and confidence taken from the most recently saved forecast, for coins that have one.
- A clearly labelled absent projection for coins the product does not forecast.
- A working "Manage list" that lets the user search for, add and remove coins, up to 10.
- The chosen list remembered on the user's own device between visits.
- Placeholder rows while loading, and a stale warning carrying the true data age.
- Removal of every fixed watchlist value the product ships today.
- Real 7-day trend lines on the Markets screen summary cards, which show none today.

### Out-of-Scope

- **Producing new forecasts for user-added coins.** Adding a coin never causes a forecast
  to be made. Only coins the product already forecasts show a projection.
- **Extending the followed coins beyond Bitcoin, Ethereum and Solana.** The hourly market
  record and the signals built on it are unchanged by this work.
- **The Markets screen table.** Its live data already works and is not touched here.
- **Sorting, filtering or reordering the strip.** Rows appear in the order the user added them.
- **Alerts or notifications on a watchlist coin.** Alerting is off the roadmap entirely.
- **Sharing or syncing a watchlist between devices or people.** No account, no personal data.
- **Trend lines refreshing on their own.** They are drawn once per page open, as elsewhere.

The following are separate roadmap items and are out of scope for this specification:
proving the collection pipeline runs and surviving neglect; cost control while there are
no users; forecasts produced on a schedule; news impact signals; deeper history backfill;
signal thresholds made measurable; scoring the news classifier; historical analogs; and
the real-time chart ticker.
