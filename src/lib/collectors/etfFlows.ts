/**
 * Spot ETF net-flow collector — parses the Farside ETH/BTC flow tables.
 *
 * Farside (`farside.co.uk/eth/`, `/btc/`) is a plain HTML table, not an
 * API — this is an explicitly fragile scrape (technical-considerations.md
 * §5: "Farside is an HTML table, not an API — it will break eventually").
 * No HTML-parsing dependency exists in package.json, so this uses
 * defensive, minimal regex-based extraction rather than adding one.
 *
 * Parsing is deliberately conservative: on ANY shape mismatch — missing
 * table, unexpected/inconsistent column count, a numeric cell that doesn't
 * parse — the whole result resolves to `null`. A fabricated `0` here would
 * read as "zero net flow" instead of "couldn't parse," which is a
 * materially different and dangerous claim, so this module never coerces
 * an unparsed cell to `0`.
 */

const FARSIDE_URLS: Record<'ETH' | 'BTC', string> = {
  ETH: 'https://farside.co.uk/eth/',
  BTC: 'https://farside.co.uk/btc/',
};

/** Farside publishes daily rows labelled e.g. "13 Aug 2026". */
const DAILY_ROW_LABEL = /^\d{1,2}\s+[A-Za-z]{3}\s+\d{4}$/;

/** Number of most-recent daily rows summed for the 7-day total. */
const SEVEN_DAY_WINDOW = 7;

/** Farside figures are denominated in USD millions. */
const USD_MILLIONS = 1_000_000;

export interface EtfFlowsResult {
  lastDayUsd: number;
  streakDays: number;
  sum7dUsd: number;
}

interface DailyRow {
  /** The date label, e.g. "13 Aug 2026" — kept only for debugging. */
  label: string;
  /** Raw text of every `<td>` in the row, in document order. */
  cells: string[];
}

/**
 * Strips tags from a table-cell's inner HTML and decodes the handful of
 * entities Farside actually uses, returning trimmed plain text.
 */
function cellText(innerHtml: string): string {
  return innerHtml
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .trim();
}

/**
 * Parses one Farside numeric cell into a value in USD-millions.
 * Handles thousands separators (`1,928`), parenthesised negatives
 * (`(5,347)`), and a trailing `*` (seed-row footnote marker). Returns
 * `null` for anything that isn't a clean number, including Farside's
 * `-` placeholder for "ETF not yet launched."
 */
function parseFarsideNumber(raw: string): number | null {
  const text = raw.trim();
  if (text.length === 0 || text === '-') {
    return null;
  }
  const isNegative = text.startsWith('(') && text.endsWith(')');
  const stripped = (isNegative ? text.slice(1, -1) : text)
    .replace(/,/g, '')
    .replace(/\*$/, '')
    .trim();
  if (!/^\d+(\.\d+)?$/.test(stripped)) {
    return null;
  }
  const value = Number(stripped);
  if (!Number.isFinite(value)) {
    return null;
  }
  return isNegative ? -value : value;
}

/**
 * Extracts every daily data row from the Farside flows table, in the
 * document's chronological order (oldest first). Returns `null` if the
 * `<table class="etf">` or its `<tbody>` is missing, or if daily rows
 * don't share a consistent column count (a sign the layout changed).
 */
function extractDailyRows(html: string): DailyRow[] | null {
  const tableMatch = /<table[^>]*class="etf"[^>]*>([\s\S]*?)<\/table>/i.exec(html);
  if (!tableMatch) {
    return null;
  }
  const tbodyMatch = /<tbody[^>]*>([\s\S]*?)<\/tbody>/i.exec(tableMatch[1]);
  if (!tbodyMatch) {
    return null;
  }

  const rowMatches = [...tbodyMatch[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  if (rowMatches.length === 0) {
    return null;
  }

  const dailyRows: DailyRow[] = [];
  let expectedColumnCount: number | null = null;

  for (const rowMatch of rowMatches) {
    const cellMatches = [...rowMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)];
    if (cellMatches.length === 0) {
      continue;
    }
    const cells = cellMatches.map((m) => cellText(m[1]));
    const label = cells[0];
    if (!DAILY_ROW_LABEL.test(label)) {
      // Non-daily row: "Seed", "Total", "Average", "Maximum", "Minimum", etc.
      continue;
    }

    if (expectedColumnCount === null) {
      expectedColumnCount = cells.length;
    } else if (cells.length !== expectedColumnCount) {
      // Layout is inconsistent across daily rows — treat as corrupted.
      return null;
    }

    // Farside renders a placeholder row for "today" before any issuer has
    // reported: every per-issuer cell is "-" and the Total column defaults
    // to "0.0". That "0.0" is not a real zero-flow reading — it's an
    // artifact of summing nothing — so treat it as not-yet-published and
    // exclude the row rather than let it masquerade as the latest day.
    const issuerCells = cells.slice(1, -1);
    const hasAnyReportedIssuer = issuerCells.some((cell) => cell !== '-');
    if (!hasAnyReportedIssuer) {
      continue;
    }

    dailyRows.push({ label, cells });
  }

  return dailyRows.length > 0 ? dailyRows : null;
}

/**
 * Pure parsing function, exported for testing against saved/fixture HTML
 * without a network call. Computes `lastDayUsd`, `streakDays`, and
 * `sum7dUsd` from the flows table's daily rows. Returns `null` on any
 * shape mismatch — see module doc.
 */
export function parseEtfHtml(html: string): EtfFlowsResult | null {
  const dailyRows = extractDailyRows(html);
  if (dailyRows === null) {
    return null;
  }

  // Each daily row's last column is that day's total net flow across all
  // issuers for the asset.
  const totalsOldestFirst: Array<number | null> = dailyRows.map((row) =>
    parseFarsideNumber(row.cells[row.cells.length - 1]),
  );

  const lastTotal = totalsOldestFirst[totalsOldestFirst.length - 1];
  if (lastTotal === null) {
    return null;
  }
  const lastDayUsd = lastTotal * USD_MILLIONS;

  if (totalsOldestFirst.length < SEVEN_DAY_WINDOW) {
    return null;
  }
  const last7 = totalsOldestFirst.slice(-SEVEN_DAY_WINDOW);
  if (last7.some((v) => v === null)) {
    return null;
  }
  const sum7dUsd = (last7 as number[]).reduce((sum, v) => sum + v, 0) * USD_MILLIONS;

  // Streak: consecutive days (walking backward from most recent) whose
  // sign matches the most recent day's sign. Stops at the first
  // unparseable row (older data may be legitimately sparse) rather than
  // failing the whole result — lastDayUsd/sum7dUsd have already been
  // validated above independent of how far the streak extends.
  const lastSign = Math.sign(lastTotal);
  let streakDays = 0;
  for (let i = totalsOldestFirst.length - 1; i >= 0; i--) {
    const total = totalsOldestFirst[i];
    if (total === null || Math.sign(total) !== lastSign) {
      break;
    }
    streakDays++;
  }

  return { lastDayUsd, streakDays, sum7dUsd };
}

/**
 * Fetches and parses the Farside spot-ETF flow table for `asset`.
 * Resolves to `null` on non-200 response, network failure, or any parse
 * shape mismatch — never throws. SOL has no spot ETF, so it isn't a valid
 * argument (excluded at the type level).
 */
export async function fetchEtfFlows(asset: 'ETH' | 'BTC'): Promise<EtfFlowsResult | null> {
  try {
    const res = await fetch(FARSIDE_URLS[asset], {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; CatoshiDashboard/1.0; +https://catoshi.dashboard)',
      },
    });
    if (!res.ok) {
      return null;
    }
    const html = await res.text();
    return parseEtfHtml(html);
  } catch {
    return null;
  }
}
