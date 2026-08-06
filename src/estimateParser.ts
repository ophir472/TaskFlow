// Parses common free-text time estimates into minutes.
// Handles: "2h", "30m", "1h 30m", "1.5h", "3d", "2w", "1d 4h", etc.
// Assumptions: d = 8-hour workday, w = 5-workday week.
// Returns 0 for anything unparseable so unstructured strings ("half a day",
// "quick") don't blow up totals.
const DAY_MINUTES = 8 * 60;
const WEEK_MINUTES = 5 * DAY_MINUTES;

export function parseEstimate(raw: string | undefined): number {
  if (!raw) return 0;
  const s = raw.toLowerCase().trim();
  if (!s) return 0;
  // Grab every "<number><unit>" pair anywhere in the string.
  // Number can be integer or decimal. Unit is a single letter (m/h/d/w).
  const re = /(\d+(?:\.\d+)?)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|week|weeks)\b/g;
  let total = 0;
  let matched = false;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    matched = true;
    const n = parseFloat(m[1]);
    const u = m[2][0];
    if (u === 'm') total += n;
    else if (u === 'h') total += n * 60;
    else if (u === 'd') total += n * DAY_MINUTES;
    else if (u === 'w') total += n * WEEK_MINUTES;
  }
  if (matched) return Math.round(total);
  // Bare number (no unit) → treat as hours by convention (e.g. "2" = 2h).
  const bare = /^\s*(\d+(?:\.\d+)?)\s*$/.exec(s);
  if (bare) return Math.round(parseFloat(bare[1]) * 60);
  return 0;
}

// "5h 30m" style formatter for summaries. Skips zero components.
export function formatMinutes(mins: number): string {
  if (mins <= 0) return '0m';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
