/**
 * The market calendar, read from Pyth.
 *
 * Until now this repo hardcoded a set of 2026 holidays and the literals 09:30 and
 * 16:00. Pyth publishes the real thing — sessions, weekends and dated holiday
 * overrides including half days — as a schedule string on every equity feed, from
 * a metadata endpoint that is still keyless after the Core upgrade.
 *
 * Two rules govern everything here, and both exist to protect the backtest:
 *
 *   1. There is no global mutable calendar. The calendar is threaded in as a
 *      trailing argument that defaults to BUILTIN. A global would leak between
 *      simulation and live mode, which are mounted at the same time, and would make
 *      an 800-night run order-dependent.
 *   2. Every failure path returns BUILTIN. A parse error, a 404, a timeout and a
 *      hostile response all degrade to exactly today's behaviour.
 */

import type { SourceReport } from './feeds';

/** Minutes from ET midnight. `{open:570, close:960}` is 09:30–16:00. */
export interface Range { open: number; close: number }
/** An empty array means closed all day. */
export type DayRule = Range[];

export interface MarketCalendar {
  tz: string;
  /** Index 0 = Monday … 6 = Sunday, matching Pyth's ordering. */
  weekly: DayRule[];
  /** Keyed 'MM-DD'. Year-agnostic, exactly as Pyth applies them. */
  overrides: Record<string, DayRule>;
  source: 'builtin' | 'pyth' | 'pyth+builtin';
  /** The verbatim schedule string, for display. Null when builtin. */
  raw: string | null;
  symbol: string | null;
  fetchedAt: number | null;
}

const REGULAR: DayRule = [{ open: 570, close: 960 }];

/**
 * Exactly the behaviour this repo had before Pyth: 09:30–16:00 weekdays, the ten
 * 2026 US market holidays, weekends closed. Kept as the floor so that losing Pyth
 * is a no-op rather than a regression.
 */
export const BUILTIN_CALENDAR: MarketCalendar = {
  tz: 'America/New_York',
  weekly: [REGULAR, REGULAR, REGULAR, REGULAR, REGULAR, [], []],
  overrides: {
    '01-01': [], '01-19': [], '02-16': [], '04-03': [], '05-25': [],
    '06-19': [], '07-03': [], '09-07': [], '11-26': [], '12-25': [],
  },
  source: 'builtin',
  raw: null,
  symbol: null,
  fetchedAt: null,
};

const WD: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

/**
 * The rule in force on a given day.
 *
 * Two object lookups and nothing else — no Date, no Intl, no allocation.
 * `informationHoursAhead` calls this ~131 times per mark, and the 800-night
 * backtest calls that ~13,000 times. Doing anything heavier here is how the
 * backtest went from seconds to minutes once before.
 */
export function ruleFor(cal: MarketCalendar, dateISO: string, weekday: string): DayRule {
  return cal.overrides[dateISO.slice(5)] ?? cal.weekly[WD[weekday]] ?? [];
}

/** `C` closed · `O` open all day · `HHMM-HHMM` · several ranges joined by `&`. */
export function parseDayRule(s: string): DayRule {
  const t = s.trim();
  if (t === 'C') return [];
  if (t === 'O') return [{ open: 0, close: 1440 }];

  const out: Range[] = [];
  for (const part of t.split('&')) {
    const m = /^(\d{2})(\d{2})-(\d{2})(\d{2})$/.exec(part.trim());
    if (!m) throw new SyntaxError(`bad session range: ${part}`);
    const open = Number(m[1]) * 60 + Number(m[2]);
    const close = Number(m[3]) * 60 + Number(m[4]);
    if (!(close > open)) throw new SyntaxError(`non-increasing range: ${part}`);
    out.push({ open, close });
  }
  out.sort((a, b) => a.open - b.open);
  for (let i = 1; i < out.length; i++) {
    if (out[i].open < out[i - 1].close) throw new SyntaxError(`overlapping ranges in ${t}`);
  }
  return out;
}

/**
 * `America/New_York;0930-1600,...,C,C;0907/C,1127/0930-1300,...`
 *
 * Semicolon-separated: timezone, then seven day rules Mon..Sun, then an optional
 * list of dated MMDD overrides. Crypto feeds render as `...;O,O,O,O,O,O,O;` with an
 * empty third part, so a trailing separator is legal.
 */
export function parseSchedule(raw: string): Pick<MarketCalendar, 'tz' | 'weekly' | 'overrides'> {
  const parts = raw.split(';');
  if (parts.length < 2) throw new SyntaxError('schedule needs at least tz and weekly');

  const tz = parts[0].trim();
  if (tz !== 'America/New_York') {
    // Every session judgement downstream is ET wall-clock. Rather than silently
    // mis-handle another zone, refuse and fall back to builtin.
    throw new SyntaxError(`unsupported timezone: ${tz}`);
  }

  const days = parts[1].split(',');
  if (days.length !== 7) throw new SyntaxError(`expected 7 day rules, got ${days.length}`);
  const weekly = days.map(parseDayRule);

  const overrides: Record<string, DayRule> = {};
  const tail = (parts[2] ?? '').trim();
  if (tail) {
    for (const entry of tail.split(',')) {
      const [mmdd, rule] = entry.split('/');
      if (!/^\d{4}$/.test(mmdd ?? '') || rule === undefined) {
        throw new SyntaxError(`bad override: ${entry}`);
      }
      overrides[`${mmdd.slice(0, 2)}-${mmdd.slice(2)}`] = parseDayRule(rule);
    }
  }
  return { tz, weekly, overrides };
}

/**
 * Union, not replacement — and this matters.
 *
 * Pyth's override list is a rolling ~12 months with no year on the dates. Today it
 * carries none of 2026's first-half holidays, and it carries `0326`, which is Good
 * Friday 2027 and would wrongly close 2026-03-26 under naive MM-DD matching. Taking
 * Pyth's list wholesale would therefore both delete holidays we know about and
 * invent one we do not. Pyth wins on conflict; the builtin set fills the gaps.
 */
export function mergeWithBuiltin(
  p: Pick<MarketCalendar, 'tz' | 'weekly' | 'overrides'>,
  raw: string,
  symbol: string,
): MarketCalendar {
  return {
    tz: p.tz,
    weekly: p.weekly,
    overrides: { ...BUILTIN_CALENDAR.overrides, ...p.overrides },
    source: 'pyth+builtin',
    raw,
    symbol,
    fetchedAt: Date.now(),
  };
}

export interface MarketHours {
  isOpen: boolean;
  nextOpen: number | null;
  nextClose: number | null;
}

const HERMES = 'https://hermes.pyth.network/v2/price_feeds';
const CACHE_KEY = 'noctis.pyth.schedule.v1';

/** Safari private mode throws on localStorage; never let that matter. */
function readCache(): MarketCalendar | null {
  try {
    const s = localStorage.getItem(CACHE_KEY);
    if (!s) return null;
    const { raw, symbol, fetchedAt } = JSON.parse(s);
    if (!raw || Date.now() - fetchedAt > 24 * 3_600_000) return null;
    return mergeWithBuiltin(parseSchedule(raw), raw, symbol);
  } catch { return null; }
}
function writeCache(raw: string, symbol: string) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ raw, symbol, fetchedAt: Date.now() }));
  } catch { /* quota, private mode — not worth a branch */ }
}
export const cachedCalendar = readCache;

export interface CalendarFetch {
  calendar: MarketCalendar;
  marketHours: MarketHours | null;
  report: SourceReport;
}

/** Never rejects. Every failure yields BUILTIN and a degraded SourceReport. */
export async function fetchPythCalendar(under = 'AAPL', timeoutMs = 2500): Promise<CalendarFetch> {
  const url = `${HERMES}?query=${under}&asset_type=equity`;
  const t0 = Date.now();
  const fail = (detail: string): CalendarFetch => ({
    calendar: BUILTIN_CALENDAR,
    marketHours: null,
    report: { name: 'Pyth · market schedule', url, status: 'degraded', detail, ms: Date.now() - t0 },
  });

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) return fail(`HTTP ${r.status} — builtin calendar in force`);
    const feeds = await r.json();
    // `query=SPY` returns SPY, SPYG, SPYV and SPYM. Match the symbol exactly.
    const want = `Equity.US.${under}/USD`;
    const feed = (feeds as any[]).find((f) => f?.attributes?.symbol === want);
    if (!feed?.attributes?.schedule) return fail(`no ${want} in response — builtin in force`);

    const raw: string = feed.attributes.schedule;
    const calendar = mergeWithBuiltin(parseSchedule(raw), raw, want);
    writeCache(raw, want);

    const mh = feed.market_hours;
    return {
      calendar,
      marketHours: mh
        ? { isOpen: !!mh.is_open, nextOpen: mh.next_open ?? null, nextClose: mh.next_close ?? null }
        : null,
      report: {
        name: 'Pyth · market schedule', url, status: 'ok',
        detail: `${want} · merged with the builtin 2026 set`, ms: Date.now() - t0,
      },
    };
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  } finally {
    clearTimeout(timer);
  }
}
