import { useState, useEffect } from 'react';

interface Props {
  value: number | null;
  onChange: (at: number) => void;
}

type Unit = 'min' | 'hr' | 'day' | 'week';
type Mode = 'relative' | 'absolute';

const UNITS: { key: Unit; label: string; ms: number }[] = [
  { key: 'min', label: 'minutes', ms: 60_000 },
  { key: 'hr', label: 'hours', ms: 3_600_000 },
  { key: 'day', label: 'days', ms: 86_400_000 },
  { key: 'week', label: 'weeks', ms: 7 * 86_400_000 },
];

const RELATIVE_PRESETS: { label: string; amount: number; unit: Unit }[] = [
  { label: '15m', amount: 15, unit: 'min' },
  { label: '1h', amount: 1, unit: 'hr' },
  { label: '3h', amount: 3, unit: 'hr' },
  { label: 'Tomorrow', amount: 1, unit: 'day' },
  { label: '2d', amount: 2, unit: 'day' },
  { label: '1w', amount: 1, unit: 'week' },
];

function unitMs(u: Unit): number {
  return UNITS.find(x => x.key === u)!.ms;
}

function nextQuarterHour(d: Date): Date {
  const r = new Date(d);
  r.setSeconds(0, 0);
  const m = r.getMinutes();
  r.setMinutes(Math.ceil((m + 1) / 15) * 15);
  return r;
}

function pad(n: number): string { return n < 10 ? '0' + n : String(n); }
function toDateStr(d: Date): string { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function toTimeStr(d: Date): string { return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }

function nextWeekdayOffset(targetDow: number): number {
  const today = new Date().getDay();
  const diff = (targetDow - today + 7) % 7;
  return diff === 0 ? 7 : diff;
}

// "In 58 minutes", "In 3h", "3d away", "5 min ago", etc.
function relativeLabel(at: number): string {
  const delta = at - Date.now();
  const abs = Math.abs(delta);
  const past = delta < 0;
  const min = Math.round(abs / 60_000);
  if (min < 1) return past ? 'just now' : 'in <1 min';
  if (min < 60) return past ? `${min} min ago` : `In ${min} minute${min === 1 ? '' : 's'}`;
  const h = Math.round(abs / 3_600_000);
  if (h < 24) return past ? `${h}h ago` : `In ${h}h`;
  const d = Math.round(abs / 86_400_000);
  return past ? `${d}d ago` : `In ${d}d`;
}

export function OneTimePicker({ value, onChange }: Props) {
  const [mode, setMode] = useState<Mode>('relative');
  const [amount, setAmount] = useState<number>(1);
  const [unit, setUnit] = useState<Unit>('hr');
  const initialDate = value ? new Date(value) : nextQuarterHour(new Date(Date.now() + 3_600_000));
  const [dateStr, setDateStr] = useState<string>(toDateStr(initialDate));
  const [timeStr, setTimeStr] = useState<string>(toTimeStr(initialDate));

  useEffect(() => {
    if (mode !== 'relative') return;
    const at = Date.now() + Math.max(0, amount) * unitMs(unit);
    onChange(at);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, amount, unit]);

  useEffect(() => {
    if (mode !== 'absolute') return;
    if (!dateStr || !timeStr) return;
    const [y, m, d] = dateStr.split('-').map(Number);
    const [hh, mm] = timeStr.split(':').map(Number);
    const at = new Date(y, m - 1, d, hh, mm).getTime();
    onChange(at);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, dateStr, timeStr]);

  const absolutePresets = [
    { label: 'Today 9:00', hh: 9, mm: 0, offsetDays: 0 },
    { label: 'Today 17:00', hh: 17, mm: 0, offsetDays: 0 },
    { label: 'Tomorrow 9:00', hh: 9, mm: 0, offsetDays: 1 },
    { label: 'Mon 9:00', hh: 9, mm: 0, offsetDays: nextWeekdayOffset(1) },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Top row: mode toggle on the left, live summary on the right */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4, background: 'var(--t-surf2)', padding: 3, borderRadius: 999, border: '1px solid var(--t-brd)' }}>
          {(['relative', 'absolute'] as Mode[]).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              style={{
                padding: '6px 16px', borderRadius: 999, border: 'none',
                fontSize: 13, fontWeight: 700, cursor: 'pointer',
                background: mode === m ? 'var(--t-acc)' : 'transparent',
                color: mode === m ? 'white' : 'var(--t-txt2)',
                transition: 'background 0.12s, color 0.12s',
              }}>
              {m === 'relative' ? 'In…' : 'On a date'}
            </button>
          ))}
        </div>

        {value && (
          <div style={{ textAlign: 'right', lineHeight: 1.25 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t-txt)' }}>
              {new Date(value).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </div>
            <div style={{ fontSize: 11, color: 'var(--t-acc-dk)', fontWeight: 600 }}>
              {relativeLabel(value)}
            </div>
          </div>
        )}
      </div>

      {/* Two-column layout: main picker on left, preset column on right */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 260px', minWidth: 260 }}>
          {mode === 'relative' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: 'var(--t-muted)' }}>In</span>
              <input
                type="number" min={1}
                value={amount}
                onChange={e => setAmount(Math.max(1, parseInt(e.target.value) || 1))}
                style={{
                  width: 64, fontSize: 15, fontWeight: 600,
                  padding: '8px 10px', textAlign: 'center',
                  borderRadius: 8, border: '1px solid var(--t-brd)',
                  background: 'var(--t-surf)', color: 'var(--t-txt)', outline: 'none',
                }}
              />
              <div style={{ display: 'flex', gap: 4, background: 'var(--t-surf2)', padding: 3, borderRadius: 8, border: '1px solid var(--t-brd)' }}>
                {UNITS.map(u => (
                  <button
                    key={u.key}
                    type="button"
                    onClick={() => setUnit(u.key)}
                    style={{
                      padding: '6px 12px', borderRadius: 6, border: 'none',
                      fontSize: 13, fontWeight: 700, cursor: 'pointer',
                      background: unit === u.key ? 'var(--t-acc)' : 'transparent',
                      color: unit === u.key ? 'white' : 'var(--t-txt2)',
                      transition: 'background 0.12s, color 0.12s',
                    }}>
                    {u.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Date</span>
                <input
                  type="date"
                  value={dateStr}
                  onChange={e => setDateStr(e.target.value)}
                  style={{
                    fontSize: 14, padding: '8px 10px', borderRadius: 8,
                    border: '1px solid var(--t-brd)', background: 'var(--t-surf)',
                    color: 'var(--t-txt)', outline: 'none',
                  }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Time</span>
                <input
                  type="time"
                  value={timeStr}
                  onChange={e => setTimeStr(e.target.value)}
                  style={{
                    fontSize: 14, padding: '8px 10px', borderRadius: 8,
                    border: '1px solid var(--t-brd)', background: 'var(--t-surf)',
                    color: 'var(--t-txt)', outline: 'none',
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Preset column (right side) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 110 }}>
          {mode === 'relative'
            ? RELATIVE_PRESETS.map(p => {
                const active = amount === p.amount && unit === p.unit;
                return (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => { setAmount(p.amount); setUnit(p.unit); }}
                    style={{
                      padding: '6px 12px', borderRadius: 8,
                      border: `1.5px solid ${active ? 'var(--t-acc)' : 'var(--t-brd)'}`,
                      background: active ? 'var(--t-acc)' : 'transparent',
                      color: active ? 'white' : 'var(--t-txt2)',
                      fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'background 0.12s, color 0.12s, border-color 0.12s',
                    }}>
                    {p.label}
                  </button>
                );
              })
            : absolutePresets.map(p => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => {
                    const d = new Date();
                    d.setDate(d.getDate() + p.offsetDays);
                    d.setHours(p.hh, p.mm, 0, 0);
                    setDateStr(toDateStr(d));
                    setTimeStr(toTimeStr(d));
                  }}
                  style={{
                    padding: '6px 12px', borderRadius: 8,
                    border: '1.5px solid var(--t-brd)', background: 'transparent',
                    color: 'var(--t-txt2)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                    textAlign: 'left',
                  }}>
                  {p.label}
                </button>
              ))}
        </div>
      </div>
    </div>
  );
}
