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
  if (rule.freq === 'daily') {
    return rule.every === 1 ? 'Every day' : `Every ${rule.every} days`;
  }
  if (rule.freq === 'weekly') {
    const dayStr = rule.days.map(d => DAY_NAMES[d]).join(', ');
    const n = rule.every;
    if (n === 1) return dayStr ? `Every ${dayStr}` : 'Every week';
    return dayStr ? `Every ${n} weeks on ${dayStr}` : `Every ${n} weeks`;
  }
  if (rule.freq === 'monthly') {
    if (rule.variant === 'dayOfMonth') return `Day ${rule.day} of every month`;
    return `${ORDINAL_NAMES[rule.ordinal]} ${DAY_NAMES[rule.dayOfWeek]} of every month`;
  }
  return 'Scheduled';
}

function sameDay(a: Date, b: Date) {
  return a.toDateString() === b.toDateString();
}

export function nextOccurrence(spec: ScheduleSpec, after = Date.now()): number {
  if (spec.type === 'once') return spec.at;
  return nextRecur(spec.rule, after);
}

function nextRecur(rule: RecurRule, after: number): number {
  if (rule.freq === 'daily') {
    const step = rule.every * 86_400_000;
    return after + step;
  }
  if (rule.freq === 'weekly') {
    const d = new Date(after);
    for (let i = 1; i <= rule.every * 7; i++) {
      d.setDate(d.getDate() + 1);
      if (rule.days.includes(d.getDay())) return d.getTime();
    }
    return after + rule.every * 7 * 86_400_000;
  }
  if (rule.freq === 'monthly') {
    // Advance to next month
    const base = new Date(after);
    base.setMonth(base.getMonth() + 1);
    if (rule.variant === 'dayOfMonth') {
      base.setDate(rule.day);
      base.setHours(9, 0, 0, 0);
      return base.getTime();
    }
    return nthWeekdayOfMonth(base.getFullYear(), base.getMonth(), rule.ordinal, rule.dayOfWeek);
  }
  return after + 86_400_000;
}

function nthWeekdayOfMonth(year: number, month: number, ordinal: number, dow: number): number {
  if (ordinal === -1) {
    // last occurrence: start from end of month
    const d = new Date(year, month + 1, 0); // last day
    while (d.getDay() !== dow) d.setDate(d.getDate() - 1);
    d.setHours(9, 0, 0, 0);
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
  d.setHours(9, 0, 0, 0);
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
