/**
 * Market clock. Everything in Noctis hangs off one question:
 * is the primary venue for this equity open, and if not, how long has it been shut?
 *
 * All reasoning is done in America/New_York wall time, because that is what
 * decides whether NYSE/Nasdaq are printing.
 */

export type SessionKind =
  | 'regular'      // 09:30-16:00 ET, weekday. Real price discovery.
  | 'premarket'    // 04:00-09:30 ET. Thin but real.
  | 'afterhours'   // 16:00-20:00 ET. Thin but real.
  | 'overnight'    // 20:00-04:00 ET weekday. Pyth Pro territory (24/5).
  | 'weekend'      // Fri 20:00 ET -> Mon 04:00 ET. Nothing. Nobody. Zero prints.
  | 'holiday';     // Market holiday. Same as weekend.

export interface SessionState {
  /** Wall-clock instant this session was evaluated at, ms since epoch. */
  nowMs: number;
  kind: SessionKind;
  label: string;
  /** Hours since the last regular-session close. */
  hoursClosed: number;
  /** Hours until the next regular-session open. */
  hoursToOpen: number;
  /** True when *no* venue anywhere is printing this equity. The Noctis hole. */
  isDark: boolean;
  /** True when regular session is live. */
  isOpen: boolean;
  nyTime: string;
  nyDate: string;
}

import { BUILTIN_CALENDAR, ruleFor, type MarketCalendar } from './schedule';

const MS_H = 3_600_000;

/**
 * Every session question now takes a calendar, and every one defaults to BUILTIN.
 *
 * That default is load-bearing. `world.ts` generates the backtest's latent paths
 * through `informationHoursAhead`; if the calendar it sees ever changed, the TRUTH
 * would change and every calibration figure quoted in the README would silently
 * move. Threading the calendar as a defaulted trailing argument means live mode can
 * use Pyth's while simulation and the backtest provably cannot.
 */

/** Convert an instant to New York wall-clock parts, DST-correct. */
export function nyParts(d: Date) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false, weekday: 'short',
  });
  const p: Record<string, string> = {};
  for (const { type, value } of fmt.formatToParts(d)) p[type] = value;
  const hour = p.hour === '24' ? 0 : Number(p.hour);
  return {
    y: Number(p.year), m: Number(p.month), d: Number(p.day),
    hour, minute: Number(p.minute), second: Number(p.second),
    weekday: p.weekday,
    dateISO: `${p.year}-${p.month}-${p.day}`,
    hhmm: `${String(hour).padStart(2, '0')}:${p.minute}`,
    hhmmss: `${String(hour).padStart(2, '0')}:${p.minute}:${p.second}`,
  };
}

function isTradingDay(dateISO: string, weekday: string, cal: MarketCalendar) {
  return ruleFor(cal, dateISO, weekday).length > 0;
}

/** First open and last close of a day, in minutes from ET midnight. */
function dayBounds(dateISO: string, weekday: string, cal: MarketCalendar) {
  const rule = ruleFor(cal, dateISO, weekday);
  return rule.length
    ? { open: rule[0].open, close: rule[rule.length - 1].close, rule }
    : { open: 570, close: 960, rule };
}

/** Extended-hours width around the regular session: 04:00 open, 20:00 close. */
const PRE_MINUTES = 330;
const POST_MINUTES = 240;

/** Step a Date by whole days, keeping the same ET wall time. */
function shiftDays(d: Date, n: number) {
  return new Date(d.getTime() + n * 24 * MS_H);
}

/**
 * Find the instant of the most recent 16:00 ET regular close at or before `now`,
 * and the next 09:30 ET regular open at or after `now`.
 * Brute force over days: correct across DST without pulling in a tz library.
 */
function boundaries(now: Date, cal: MarketCalendar) {
  const etAt = (base: Date, h: number, min: number) => {
    // Binary-search the UTC instant whose ET wall clock is (base's ET date, h:min).
    const target = nyParts(base);
    let lo = new Date(base.getTime() - 36 * MS_H);
    let hi = new Date(base.getTime() + 36 * MS_H);
    for (let i = 0; i < 48; i++) {
      const mid = new Date((lo.getTime() + hi.getTime()) / 2);
      const p = nyParts(mid);
      const cmp =
        p.dateISO < target.dateISO ? -1 :
        p.dateISO > target.dateISO ? 1 :
        (p.hour * 60 + p.minute) - (h * 60 + min);
      if (cmp < 0) lo = mid; else hi = mid;
    }
    return hi;
  };

  let lastClose: Date | null = null;
  for (let i = 0; i < 14 && !lastClose; i++) {
    const day = shiftDays(now, -i);
    const p = nyParts(day);
    if (!isTradingDay(p.dateISO, p.weekday, cal)) continue;
    const { close: c } = dayBounds(p.dateISO, p.weekday, cal);
    const close = etAt(day, Math.floor(c / 60), c % 60);
    if (close.getTime() <= now.getTime()) lastClose = close;
  }

  let nextOpen: Date | null = null;
  for (let i = 0; i < 14 && !nextOpen; i++) {
    const day = shiftDays(now, i);
    const p = nyParts(day);
    if (!isTradingDay(p.dateISO, p.weekday, cal)) continue;
    const { open: o } = dayBounds(p.dateISO, p.weekday, cal);
    const open = etAt(day, Math.floor(o / 60), o % 60);
    if (open.getTime() >= now.getTime()) nextOpen = open;
  }

  return { lastClose, nextOpen };
}

/**
 * Just the session kind, without the expensive part.
 *
 * `sessionAt` binary-searches for the surrounding open/close instants, which costs
 * ~48 `Intl.DateTimeFormat` calls. `informationHoursAhead` walks a 65-hour window
 * and only ever needs the kind, so doing it the expensive way made an 800-night
 * backtest take minutes. The kind needs one clock read and a holiday lookup.
 */
export function sessionKindAt(ms: number, cal: MarketCalendar = BUILTIN_CALENDAR): SessionKind {
  const p = nyParts(new Date(ms));
  const mins = p.hour * 60 + p.minute;
  const { open, close, rule } = dayBounds(p.dateISO, p.weekday, cal);

  if (!rule.length) {
    // Saturday/Sunday come from the weekly rules; a closed weekday is a holiday.
    return p.weekday === 'Sat' || p.weekday === 'Sun' ? 'weekend' : 'holiday';
  }
  for (const r of rule) if (mins >= r.open && mins < r.close) return 'regular';
  if (mins >= open - PRE_MINUTES && mins < open) return 'premarket';
  if (mins >= close && mins < close + POST_MINUTES) return 'afterhours';
  return p.weekday === 'Fri' ? 'weekend' : 'overnight';
}

export function sessionAt(now: Date, cal: MarketCalendar = BUILTIN_CALENDAR): SessionState {
  const p = nyParts(now);
  const trading = isTradingDay(p.dateISO, p.weekday, cal);
  const mins = p.hour * 60 + p.minute;
  const { open: dOpen, close: dClose, rule } = dayBounds(p.dateISO, p.weekday, cal);
  const { lastClose, nextOpen } = boundaries(now, cal);

  const hoursClosed = lastClose ? (now.getTime() - lastClose.getTime()) / MS_H : 0;
  const hoursToOpen = nextOpen ? (nextOpen.getTime() - now.getTime()) / MS_H : 0;

  let kind: SessionKind;
  if (!trading) {
    kind = p.weekday === 'Sat' || p.weekday === 'Sun' ? 'weekend' : 'holiday';
  } else if (rule.some((r) => mins >= r.open && mins < r.close)) kind = 'regular';
  else if (mins >= dOpen - PRE_MINUTES && mins < dOpen) kind = 'premarket';
  else if (mins >= dClose && mins < dClose + POST_MINUTES) kind = 'afterhours';
  else kind = 'overnight';

  // Friday 20:00 ET onward is already the weekend hole even though Friday is a trading day.
  if (kind === 'overnight' && p.weekday === 'Fri') kind = 'weekend';

  const LABEL: Record<SessionKind, string> = {
    regular: 'REGULAR SESSION',
    premarket: 'PRE-MARKET',
    afterhours: 'AFTER HOURS',
    overnight: 'OVERNIGHT (24/5)',
    weekend: 'WEEKEND — MARKET DARK',
    holiday: 'HOLIDAY — MARKET DARK',
  };

  return {
    nowMs: now.getTime(),
    kind,
    label: LABEL[kind],
    hoursClosed,
    hoursToOpen,
    isDark: kind === 'weekend' || kind === 'holiday',
    isOpen: kind === 'regular',
    nyTime: p.hhmmss,
    nyDate: `${p.weekday} ${p.dateISO}`,
  };
}

const WEIGHT: Record<SessionKind, number> = {
  regular: 1.0, premarket: 0.55, afterhours: 0.45,
  overnight: 0.30, weekend: 0.12, holiday: 0.12,
};

/**
 * "Trading-hour equivalents" elapsed since close. Information does not arrive at a
 * constant rate: an hour of a Tokyo session carries more than an hour of a US Sunday
 * 04:00. We discount calendar time by an activity weight so sigma does not blow up
 * absurdly across a 62-hour weekend.
 */
export function informationHours(hoursClosed: number, kind: SessionKind): number {
  return hoursClosed * WEIGHT[kind];
}

/**
 * Information time between now and the next opening bell, INTEGRATED.
 *
 * Applying the current session's weight to the whole remaining window is wrong and
 * badly so. At Monday noon the next bell is ~21 hours away; almost all of that is
 * overnight, but the current session is `regular`, so a flat weight of 1.0 counts
 * 21 calendar hours as 21 trading hours — three days of information — and sigma
 * comes out at 3% for AAPL while Nasdaq is actively printing it.
 *
 * Walk the window instead and sum the weight of whatever session each hour
 * actually falls in.
 */
export function informationHoursAhead(
  nowMs: number, hoursToOpen: number, cal: MarketCalendar = BUILTIN_CALENDAR,
): number {
  if (hoursToOpen <= 0) return 0;
  const STEP = 0.5;
  let total = 0;
  for (let h = 0; h < hoursToOpen; h += STEP) {
    const slice = Math.min(STEP, hoursToOpen - h);
    total += slice * WEIGHT[sessionKindAt(nowMs + h * MS_H, cal)];
  }
  return total;
}

export function fmtDuration(hours: number): string {
  const h = Math.max(0, hours);
  const d = Math.floor(h / 24);
  const rh = Math.floor(h % 24);
  const m = Math.floor((h % 1) * 60);
  if (d > 0) return `${d}d ${rh}h ${m}m`;
  if (rh > 0) return `${rh}h ${m}m`;
  return `${m}m`;
}
