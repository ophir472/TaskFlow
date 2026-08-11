import { useState } from 'react';
import type { ScheduleSpec, MonthlyOrdinalRule } from '../../types';
import { formatSchedule } from '../../scheduleEngine';
import { OneTimePicker } from './OneTimePicker';

// ── Sub-types for internal state ─────────────────────────────────

type Freq = 'daily' | 'weekly' | 'monthly';
type MonthVariant = 'dayOfMonth' | 'ordinal';

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ORDINALS: { v: MonthlyOrdinalRule['ordinal']; label: string }[] = [
  { v: 1, label: 'First' }, { v: 2, label: 'Second' }, { v: 3, label: 'Third' },
  { v: 4, label: 'Fourth' }, { v: -1, label: 'Last' },
];

// ── Styles ───────────────────────────────────────────────────────

const tab = (active: boolean): React.CSSProperties => ({
  flex: 1, textAlign: 'center', padding: '7px 0', borderRadius: 6, fontSize: 13, fontWeight: 700,
  cursor: 'pointer', userSelect: 'none',
  background: active ? 'var(--t-acc)' : 'transparent',
  color: active ? 'white' : 'var(--t-txt2)',
  transition: 'background 0.12s, color 0.12s',
});

const pill = (active: boolean): React.CSSProperties => ({
  padding: '5px 11px', borderRadius: 999, fontSize: 12.5, fontWeight: 500, cursor: 'pointer',
  border: `1.5px solid ${active ? 'var(--t-acc)' : 'var(--t-brd)'}`,
  background: active ? 'var(--t-acc-bg)' : 'var(--t-surf)',
  color: active ? 'var(--t-acc-dk)' : 'var(--t-txt2)', userSelect: 'none',
});

const dayBtn = (active: boolean): React.CSSProperties => ({
  width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 12, fontWeight: 600, cursor: 'pointer', userSelect: 'none',
  border: `1.5px solid ${active ? 'var(--t-acc)' : 'var(--t-brd)'}`,
  background: active ? 'var(--t-acc-bg)' : 'var(--t-surf)',
  color: active ? 'var(--t-acc-dk)' : 'var(--t-muted)',
});

const selectSm: React.CSSProperties = {
  fontSize: 13.5, padding: '6px 9px', borderRadius: 7, border: '1px solid var(--t-brd)', background: 'var(--t-surf2)', color: 'var(--t-txt)',
};

const numInput: React.CSSProperties = {
  width: 52, fontSize: 13.5, padding: '6px 8px', borderRadius: 7, border: '1px solid var(--t-brd)', textAlign: 'center', background: 'var(--t-surf2)', color: 'var(--t-txt)',
};

// ── Component ────────────────────────────────────────────────────

interface Props {
  value: ScheduleSpec | null;
  onChange: (spec: ScheduleSpec) => void;
  allowRecurring?: boolean;
}

export function SchedulePicker({ value, onChange, allowRecurring = true }: Props) {
  const [activeTab, setActiveTab] = useState<'once' | 'recurring'>(
    value?.type === 'recurring' ? 'recurring' : 'once'
  );

  // Recurring state
  const [freq, setFreq] = useState<Freq>(
    value?.type === 'recurring' ? value.rule.freq : 'weekly'
  );
  const [every, setEvery] = useState<number>(
    value?.type === 'recurring' && 'every' in value.rule ? (value.rule.every ?? 1) : 1
  );
  const [days, setDays] = useState<number[]>(
    value?.type === 'recurring' && value.rule.freq === 'weekly' ? value.rule.days : [1] // Mon default
  );
  const [monthVariant, setMonthVariant] = useState<MonthVariant>(
    value?.type === 'recurring' && value.rule.freq === 'monthly' ? value.rule.variant : 'ordinal'
  );
  const [monthDay, setMonthDay] = useState<number>(
    value?.type === 'recurring' && value.rule.freq === 'monthly' && value.rule.variant === 'dayOfMonth'
      ? value.rule.day : 1
  );
  const [ordinal, setOrdinal] = useState<MonthlyOrdinalRule['ordinal']>(
    value?.type === 'recurring' && value.rule.freq === 'monthly' && value.rule.variant === 'ordinal'
      ? value.rule.ordinal : 1
  );
  const [ordinalDay, setOrdinalDay] = useState<MonthlyOrdinalRule['dayOfWeek']>(
    value?.type === 'recurring' && value.rule.freq === 'monthly' && value.rule.variant === 'ordinal'
      ? value.rule.dayOfWeek : 0 // Sun default
  );

  const [recTime, setRecTime] = useState<string>(() =>
    value?.type === 'recurring' && value.time
      ? `${String(value.time.hour).padStart(2, '0')}:${String(value.time.minute).padStart(2, '0')}`
      : '09:00'
  );

  function buildOnce(at: number): ScheduleSpec {
    return { type: 'once', at };
  }

  // Single source for the recurring spec: current state merged with the
  // just-changed value (state setters are async, so handlers pass overrides).
  function specFrom(over: Partial<{
    freq: Freq; every: number; days: number[]; monthVariant: MonthVariant;
    monthDay: number; ordinal: MonthlyOrdinalRule['ordinal'];
    ordinalDay: MonthlyOrdinalRule['dayOfWeek']; recTime: string;
  }> = {}): ScheduleSpec {
    const f = over.freq ?? freq;
    const ev = over.every ?? every;
    const ds = over.days ?? days;
    const mv = over.monthVariant ?? monthVariant;
    const md = over.monthDay ?? monthDay;
    const od = over.ordinal ?? ordinal;
    const odw = over.ordinalDay ?? ordinalDay;
    const [h, m] = (over.recTime ?? recTime).split(':').map(Number);
    const time = { hour: h || 0, minute: m || 0 };
    if (f === 'daily') return { type: 'recurring', rule: { freq: 'daily', every: ev }, time };
    if (f === 'weekly') return { type: 'recurring', rule: { freq: 'weekly', every: ev, days: ds.length ? ds : [1] }, time };
    if (mv === 'dayOfMonth') return { type: 'recurring', rule: { freq: 'monthly', variant: 'dayOfMonth', day: md, every: ev }, time };
    return { type: 'recurring', rule: { freq: 'monthly', variant: 'ordinal', ordinal: od, dayOfWeek: odw, every: ev }, time };
  }

  function toggleDay(d: number) {
    const next = days.includes(d) ? days.filter(x => x !== d) : [...days, d].sort((a, b) => a - b);
    setDays(next);
    onChange(specFrom({ days: next.length ? next : [d] }));
  }

  const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' };
  const label: React.CSSProperties = { fontSize: 12, color: 'var(--t-muted)', whiteSpace: 'nowrap' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Tab switcher */}
      {allowRecurring && (
        <div style={{ display: 'flex', gap: 4, background: 'var(--t-surf2)', padding: 3, borderRadius: 8, border: '1px solid var(--t-brd)' }}>
          <div onClick={() => setActiveTab('once')} style={tab(activeTab === 'once')}>One-time</div>
          <div onClick={() => setActiveTab('recurring')} style={tab(activeTab === 'recurring')}>Recurring</div>
        </div>
      )}

      {/* One-time — uses the new relative/absolute picker */}
      {activeTab === 'once' && (
        <OneTimePicker
          value={value?.type === 'once' ? value.at : null}
          onChange={at => onChange(buildOnce(at))}
        />
      )}

      {/* Recurring */}
      {activeTab === 'recurring' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Frequency selector — the every-N input applies to all three
              frequencies (every 3 months = quarterly) */}
          <div style={row}>
            <span style={label}>Every</span>
            <input
              type="number" min={1} max={52}
              value={every}
              onChange={e => { const n = Math.max(1, +e.target.value); setEvery(n); onChange(specFrom({ every: n })); }}
              style={numInput}
            />
            <div style={{ display: 'flex', gap: 4 }}>
              {(['daily', 'weekly', 'monthly'] as Freq[]).map(f => (
                <div key={f} onClick={() => { setFreq(f); onChange(specFrom({ freq: f })); }} style={pill(freq === f)}>
                  {f === 'daily' ? (every > 1 ? 'Days' : 'Day') : f === 'weekly' ? (every > 1 ? 'Weeks' : 'Week') : (every > 1 ? 'Months' : 'Month')}
                </div>
              ))}
            </div>
          </div>

          {/* Weekly: day-of-week toggles */}
          {freq === 'weekly' && (
            <div style={row}>
              <span style={label}>On</span>
              {DAY_LABELS.map((lbl, i) => (
                <div key={i} onClick={() => toggleDay(i)} style={dayBtn(days.includes(i))} title={DAY_FULL[i]}>{lbl}</div>
              ))}
            </div>
          )}

          {/* Monthly: variant picker */}
          {freq === 'monthly' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Ordinal option */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13.5 }}>
                <input type="radio" checked={monthVariant === 'ordinal'} onChange={() => { setMonthVariant('ordinal'); onChange(specFrom({ monthVariant: 'ordinal' })); }} />
                <span>The</span>
                <select value={ordinal} onChange={e => { const v = +e.target.value as MonthlyOrdinalRule['ordinal']; setOrdinal(v); onChange(specFrom({ ordinal: v, monthVariant: 'ordinal' })); }} style={selectSm} disabled={monthVariant !== 'ordinal'}>
                  {ORDINALS.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
                </select>
                <select value={ordinalDay} onChange={e => { const v = +e.target.value as MonthlyOrdinalRule['dayOfWeek']; setOrdinalDay(v); onChange(specFrom({ ordinalDay: v, monthVariant: 'ordinal' })); }} style={selectSm} disabled={monthVariant !== 'ordinal'}>
                  {DAY_FULL.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
                <span>of the month</span>
              </label>

              {/* Day-of-month option */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13.5 }}>
                <input type="radio" checked={monthVariant === 'dayOfMonth'} onChange={() => { setMonthVariant('dayOfMonth'); onChange(specFrom({ monthVariant: 'dayOfMonth' })); }} />
                <span>Day</span>
                <input type="number" min={1} max={31} value={monthDay} onChange={e => { const v = Math.min(31, Math.max(1, +e.target.value)); setMonthDay(v); onChange(specFrom({ monthDay: v, monthVariant: 'dayOfMonth' })); }} style={{ ...numInput, width: 48 }} disabled={monthVariant !== 'dayOfMonth'} />
                <span>of the month</span>
              </label>
            </div>
          )}

          {/* Fire time — applies to every frequency */}
          <div style={row}>
            <span style={label}>At</span>
            <input
              type="time"
              value={recTime}
              onChange={e => { const v = e.target.value || '09:00'; setRecTime(v); onChange(specFrom({ recTime: v })); }}
              style={{ fontSize: 13.5, padding: '6px 9px', borderRadius: 7, border: '1px solid var(--t-brd)', background: 'var(--t-surf2)', color: 'var(--t-txt)', outline: 'none' }}
            />
            {value?.type === 'recurring' && (
              <span style={{ fontSize: 12, color: 'var(--t-acc-dk)', background: 'var(--t-acc-bg)', padding: '4px 10px', borderRadius: 6 }}>
                {formatSchedule(value)}
              </span>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
