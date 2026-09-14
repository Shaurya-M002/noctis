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

const MS_H = 3_600_000;

/** US market holidays that matter for a 2026 demo. */
const HOLIDAYS_2026 = new Set([
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25',
  '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
]);

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

function isTradingDay(dateISO: string, weekday: string) {
  if (weekday === 'Sat' || weekday === 'Sun') return false;
  return !HOLIDAYS_2026.has(dateISO);
}

/** Step a Date by whole days, keeping the same ET wall time. */
function shiftDays(d: Date, n: number) {
  return new Date(d.getTime() + n * 24 * MS_H);
}

/**
 * Find the instant of the most recent 16:00 ET regular close at or before `now`,
 * and the next 09:30 ET regular open at or after `now`.
 * Brute force over days: correct across DST without pulling in a tz library.
 */
function boundaries(now: Date) {
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
    if (!isTradingDay(p.dateISO, p.weekday)) continue;
    const close = etAt(day, 16, 0);
    if (close.getTime() <= now.getTime()) lastClose = close;
  }

  let nextOpen: Date | null = null;
  for (let i = 0; i < 14 && !nextOpen; i++) {
    const day = shiftDays(now, i);
    const p = nyParts(day);
    if (!isTradingDay(p.dateISO, p.weekday)) continue;
    const open = etAt(day, 9, 30);
    if (open.getTime() >= now.getTime()) nextOpen = open;
  }

  return { lastClose, nextOpen };
}

export function sessionAt(now: Date): SessionState {
  const p = nyParts(now);
  const trading = isTradingDay(p.dateISO, p.weekday);
  const mins = p.hour * 60 + p.minute;
  const { lastClose, nextOpen } = boundaries(now);

  const hoursClosed = lastClose ? (now.getTime() - lastClose.getTime()) / MS_H : 0;
  const hoursToOpen = nextOpen ? (nextOpen.getTime() - now.getTime()) / MS_H : 0;

  let kind: SessionKind;
  if (!trading) {
    kind = HOLIDAYS_2026.has(p.dateISO) ? 'holiday' : 'weekend';
  } else if (mins >= 570 && mins < 960) kind = 'regular';
  else if (mins >= 240 && mins < 570) kind = 'premarket';
  else if (mins >= 960 && mins < 1200) kind = 'afterhours';
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

/**
 * "Trading-hour equivalents" elapsed since close. Information does not arrive at a
 * constant rate: an hour of a Tokyo session carries more than an hour of a US Sunday
 * 04:00. We discount calendar time by an activity weight so sigma does not blow up
 * absurdly across a 62-hour weekend.
 */
export function informationHours(hoursClosed: number, kind: SessionKind): number {
  const WEIGHT: Record<SessionKind, number> = {
    regular: 1.0, premarket: 0.55, afterhours: 0.45,
    overnight: 0.30, weekend: 0.12, holiday: 0.12,
  };
  return hoursClosed * WEIGHT[kind];
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
