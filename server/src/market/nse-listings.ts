import { Logger } from '@nestjs/common';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { UniverseStock } from './universe';
import { NSE_UNIVERSE } from './universe';

const logger = new Logger('NseListings');

export type ListedStock = UniverseStock & { isin?: string };

const EQUITY_SERIES = new Set(['EQ', 'BE', 'BZ', 'SM', 'ST', 'IV', 'RR']);

const CSV_URLS = [
  'https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv',
  'https://archives.nseindia.com/content/equities/EQUITY_L.csv',
  'https://www.nseindia.com/content/equities/EQUITY_L.csv',
];

const UNIVERSE_BY_SYMBOL = new Map(
  NSE_UNIVERSE.map((s) => [s.symbol.toUpperCase(), s] as const),
);

function nseHeaders(cookie = '') {
  return {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
    Accept: 'text/csv,text/plain,*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    Referer: 'https://www.nseindia.com/',
    ...(cookie ? { Cookie: cookie } : {}),
  };
}

async function warmCookie(): Promise<string> {
  try {
    const res = await fetch('https://www.nseindia.com/', {
      headers: nseHeaders(),
      signal: AbortSignal.timeout(20000),
    });
    const setCookie =
      typeof res.headers.getSetCookie === 'function'
        ? res.headers.getSetCookie()
        : [];
    if (setCookie.length) {
      return setCookie.map((c) => c.split(';')[0]).join('; ');
    }
  } catch (err) {
    logger.warn(
      `NSE session warm failed: ${err instanceof Error ? err.message : err}`,
    );
  }
  return '';
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      cells.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

function parseEquityCsv(text: string): ListedStock[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const header = parseCsvLine(lines[0]).map((h) => h.toUpperCase());
  const symbolIdx = header.findIndex((h) => h === 'SYMBOL');
  const nameIdx = header.findIndex(
    (h) => h === 'NAME OF COMPANY' || h === 'COMPANY NAME' || h === 'NAME',
  );
  const seriesIdx = header.findIndex((h) => h === 'SERIES');
  const isinIdx = header.findIndex(
    (h) => h === 'ISIN NUMBER' || h === 'ISIN',
  );
  if (symbolIdx < 0) return [];

  const bySymbol = new Map<string, ListedStock>();
  for (const line of lines.slice(1)) {
    const cols = parseCsvLine(line);
    const symbol = (cols[symbolIdx] || '').toUpperCase();
    if (!symbol || symbol === 'SYMBOL') continue;
    const series = seriesIdx >= 0 ? (cols[seriesIdx] || '').toUpperCase() : 'EQ';
    if (series && !EQUITY_SERIES.has(series)) continue;
    // Prefer EQ over other series when duplicates exist.
    const existing = bySymbol.get(symbol);
    if (existing && series !== 'EQ') continue;

    const meta = UNIVERSE_BY_SYMBOL.get(symbol);
    bySymbol.set(symbol, {
      symbol,
      name: (nameIdx >= 0 ? cols[nameIdx] : '') || meta?.name || symbol,
      sector: meta?.sector || 'Other',
      industry: meta?.industry || (series ? `NSE ${series}` : 'Equity'),
      isin: isinIdx >= 0 ? cols[isinIdx] || undefined : undefined,
    });
  }
  return Array.from(bySymbol.values()).sort((a, b) =>
    a.symbol.localeCompare(b.symbol),
  );
}

function bundledCsvCandidates(): string[] {
  return [
    join(__dirname, 'data', 'EQUITY_L.csv'),
    join(process.cwd(), 'src', 'market', 'data', 'EQUITY_L.csv'),
    join(process.cwd(), 'dist', 'market', 'data', 'EQUITY_L.csv'),
    join(process.cwd(), 'server', 'src', 'market', 'data', 'EQUITY_L.csv'),
    join(process.cwd(), 'server', 'dist', 'market', 'data', 'EQUITY_L.csv'),
  ];
}

function loadBundledEquityCsv(): ListedStock[] {
  for (const path of bundledCsvCandidates()) {
    if (!existsSync(path)) continue;
    try {
      const text = readFileSync(path, 'utf8');
      const stocks = parseEquityCsv(text);
      if (stocks.length > 500) {
        logger.log(`Loaded ${stocks.length} NSE equities from bundled ${path}`);
        return stocks;
      }
      logger.warn(
        `Bundled CSV at ${path} only had ${stocks.length} symbols — skipping`,
      );
    } catch (err) {
      logger.warn(
        `Bundled CSV read failed (${path}): ${err instanceof Error ? err.message : err}`,
      );
    }
  }
  return [];
}

/** Fetch full NSE equity master list; falls back to bundled CSV, then liquid universe. */
export async function fetchNseEquityUniverse(): Promise<{
  stocks: ListedStock[];
  source: string;
  fallback: boolean;
}> {
  // Prefer the known-good local master list first so sync is fast and reliable
  // even when NSE blocks scrapers (403). Refresh from live when available.
  const bundled = loadBundledEquityCsv();

  const cookie = await warmCookie();
  for (const url of CSV_URLS) {
    try {
      const res = await fetch(url, {
        headers: nseHeaders(cookie),
        signal: AbortSignal.timeout(45000),
      });
      if (!res.ok) {
        logger.warn(`NSE CSV ${url} → HTTP ${res.status}`);
        continue;
      }
      const text = await res.text();
      const stocks = parseEquityCsv(text);
      if (stocks.length > 500) {
        logger.log(`Loaded ${stocks.length} NSE equities from ${url}`);
        return {
          stocks,
          source: `NSE EQUITY_L.csv live (${stocks.length} symbols)`,
          fallback: false,
        };
      }
      logger.warn(
        `NSE CSV from ${url} parsed only ${stocks.length} rows — trying next`,
      );
    } catch (err) {
      logger.warn(
        `NSE CSV fetch failed (${url}): ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  if (bundled.length > 500) {
    return {
      stocks: bundled,
      source: `Bundled NSE EQUITY_L.csv (${bundled.length} symbols)`,
      fallback: true,
    };
  }

  logger.warn(
    `NSE listing fetch failed — falling back to liquid universe (${NSE_UNIVERSE.length})`,
  );
  return {
    stocks: NSE_UNIVERSE.map((s) => ({ ...s })),
    source: `Liquid universe fallback (${NSE_UNIVERSE.length} symbols)`,
    fallback: true,
  };
}
