import type { ScheduleSpec, RecurRule } from './types';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ORDINAL_NAMES: Record<number, string> = { 1: 'First', 2: 'Second', 3: 'Third', 4: 'Fourth', [-1]: 'Last' };

export function formatSchedule(spec: ScheduleSpec): string {
  if (spec.type === 'once') {
    const now = Date.now();
    const diff = spec.at - now;
    if (diff <= 0) return 'Due now';
    if (diff < 60 * 60_000) {
      const m = Math.round(diff / 60_000);
      return `In ${m} minute${m === 1 ? '' : 's'}`;
    }
    if (diff < 24 * 60 * 60_000) {
      const h = Math.round(diff / 3_600_000);
      return `In ${h} hour${h === 1 ? '' : 's'}`;
    }
    const d = new Date(spec.at);
    const today = new Date();
    const tom = new Date(today); tom.setDate(tom.getDate() + 1);
    const t = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (sameDay(d, today)) return `Today at ${t}`;
    if (sameDay(d, tom)) return `Tomorrow at ${t}`;
    return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${t}`;
  }

  const { rule } = spec;
  const timeSuffix = spec.time
    ? ` at ${String(spec.time.hour).padStart(2, '0')}:${String(spec.time.minute).padStart(2, '0')}`
    : '';
  if (rule.freq === 'daily') {
    return (rule.every === 1 ? 'Every day' : `Every ${rule.every} days`) + timeSuffix;
  }
  if (rule.freq === 'weekly') {
    const dayStr = rule.days.map(d => DAY_NAMES[d]).join(', ');
    const n = rule.every;
    const base = n === 1
      ? (dayStr ? `Every ${dayStr}` : 'Every week')
      : (dayStr ? `Every ${n} weeks on ${dayStr}` : `Every ${n} weeks`);
    return base + timeSuffix;
  }
  if (rule.freq === 'monthly') {
    const n = rule.every ?? 1;
    const monthsStr = n === 1 ? 'every month' : `every ${n} months`;
    const base = rule.variant === 'dayOfMonth'
      ? `Day ${rule.day} of ${monthsStr}`
      : `${ORDINAL_NAMES[rule.ordinal]} ${DAY_NAMES[rule.dayOfWeek]} of ${monthsStr}`;
    return base + timeSuffix;
  }
  return 'Scheduled';
}

function sameDay(a: Date, b: Date) {
  return a.toDateString() === b.toDateString();
}

type FireTime = { hour: number; minute: number } | undefined;

export function nextOccurrence(spec: ScheduleSpec, after = Date.now()): number {
  if (spec.type === 'once') return spec.at;
  return nextRecur(spec.rule, after, spec.time);
}

// Apply the configured fire time to a date. Without a configured time, keep
// the date's existing clock (legacy behavior) except where noted.
function applyTime(d: Date, time: FireTime, fallbackHour?: number): void {
  if (time) d.setHours(time.hour, time.minute, 0, 0);
  else if (fallbackHour !== undefined) d.setHours(fallbackHour, 0, 0, 0);
}

function nextRecur(rule: RecurRule, after: number, time: FireTime): number {
  if (rule.freq === 'daily') {
    const d = new Date(after);
    d.setDate(d.getDate() + rule.every);
    // With a configured time the occurrence snaps to it — no more drift from
    // "after + N days" inheriting whatever clock time the trigger ran at.
    applyTime(d, time);
    return d.getTime();
  }
  if (rule.freq === 'weekly') {
    const d = new Date(after);
    for (let i = 1; i <= rule.every * 7; i++) {
      d.setDate(d.getDate() + 1);
      if (rule.days.includes(d.getDay())) {
        applyTime(d, time);
        return d.getTime();
      }
    }
    const fallback = new Date(after + rule.every * 7 * 86_400_000);
    applyTime(fallback, time);
    return fallback.getTime();
  }
  if (rule.freq === 'monthly') {
    const every = rule.every ?? 1;
    const base = new Date(after);
    base.setDate(1); // avoid overflow while stepping months (e.g. Jan 31 + 1mo)
    base.setMonth(base.getMonth() + every);
    if (rule.variant === 'dayOfMonth') {
      // Clamp to the target month's length so "day 31" in a 30-day month
      // fires on the 30th instead of overflowing into the next month.
      const lastDay = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
      base.setDate(Math.min(rule.day, lastDay));
      applyTime(base, time, 9);
      return base.getTime();
    }
    return nthWeekdayOfMonth(base.getFullYear(), base.getMonth(), rule.ordinal, rule.dayOfWeek, time);
  }
  return after + 86_400_000;
}

function nthWeekdayOfMonth(year: number, month: number, ordinal: number, dow: number, time: FireTime): number {
  if (ordinal === -1) {
    // last occurrence: start from end of month
    const d = new Date(year, month + 1, 0); // last day
    while (d.getDay() !== dow) d.setDate(d.getDate() - 1);
    applyTime(d, time, 9);
    return d.getTime();
  }
  // nth occurrence from start of month
  const d = new Date(year, month, 1);
  let count = 0;
  while (true) {
    if (d.getDay() === dow) { count++; if (count === ordinal) break; }
    d.setDate(d.getDate() + 1);
    if (d.getMonth() !== month) return new Date(year, month + 1, 1).getTime(); // safety
  }
  applyTime(d, time, 9);
  return d.getTime();
}

// ── Helpers for quick-pick presets ──────────────────────────────

export function inMs(ms: number): number { return Date.now() + ms; }

export function tomorrowAt9(): number {
  const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d.getTime();
}

export function toDatetimeLocal(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function fromDatetimeLocal(s: string): number {
  return new Date(s).getTime();
}
