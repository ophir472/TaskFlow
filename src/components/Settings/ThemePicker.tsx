import { useStore } from '../../store';
import { THEMES } from '../../themes';
import type { Theme } from '../../themes';

interface Props {
  onBack: () => void;
}

function ThemePreview({ t }: { t: Theme }) {
  const v = t.vars;
  return (
    <div style={{
      width: '100%', height: 130, borderRadius: 10, overflow: 'hidden',
      background: v['--t-bg'], position: 'relative', userSelect: 'none',
    }}>
      {/* Sidebar strip */}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: 36,
        background: v['--t-surf'],
        borderRight: `1px solid ${v['--t-brd']}`,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        paddingTop: 10, gap: 6,
      }}>
        {/* Logo dot */}
        <div style={{ width: 18, height: 18, borderRadius: 4, background: v['--t-acc'], marginBottom: 4 }} />
        {/* Active nav item */}
        <div style={{ width: 22, height: 7, borderRadius: 3, background: v['--t-acc-bg'] }} />
        {/* Inactive nav items */}
        <div style={{ width: 22, height: 5, borderRadius: 3, background: v['--t-brd'] }} />
        <div style={{ width: 22, height: 5, borderRadius: 3, background: v['--t-brd'] }} />
        <div style={{ width: 22, height: 5, borderRadius: 3, background: v['--t-brd'] }} />
        {/* CTA button at bottom */}
        <div style={{ marginTop: 'auto', marginBottom: 10, width: 22, height: 7, borderRadius: 3, background: v['--t-acc'] }} />
      </div>

      {/* Main content */}
      <div style={{ position: 'absolute', left: 44, right: 8, top: 10, bottom: 10 }}>
        {/* Card */}
        <div style={{
          background: v['--t-surf'],
          border: `1px solid ${v['--t-brd']}`,
          borderTop: `3px solid ${v['--t-kind-task']}`,
          borderRadius: 8, padding: '8px 10px',
          display: 'flex', gap: 8,
        }}>
          {/* Main col */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
            {/* Kind badge */}
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <div style={{ height: 7, width: 28, borderRadius: 10, background: v['--t-kind-task-bg'] }} />
            </div>
            {/* Title bar */}
            <div style={{ height: 8, width: '80%', borderRadius: 3, background: v['--t-txt'], opacity: 0.85 }} />
            {/* Tag chips */}
            <div style={{ display: 'flex', gap: 3, marginTop: 2 }}>
              <div style={{ height: 6, width: 22, borderRadius: 8, background: v['--t-urgent-bg'], border: `1px solid ${v['--t-urgent']}` }} />
              <div style={{ height: 6, width: 28, borderRadius: 8, background: v['--t-important-bg'], border: `1px solid ${v['--t-important']}` }} />
              <div style={{ height: 6, width: 18, borderRadius: 8, background: v['--t-quick-bg'], border: `1px solid ${v['--t-quick']}` }} />
            </div>
            {/* Text lines */}
            <div style={{ height: 5, width: '90%', borderRadius: 2, background: v['--t-muted'], opacity: 0.4 }} />
            <div style={{ height: 5, width: '65%', borderRadius: 2, background: v['--t-muted'], opacity: 0.3 }} />
            {/* Action bar */}
            <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
              <div style={{ height: 10, width: 30, borderRadius: 4, background: v['--t-brd'] }} />
              <div style={{ height: 10, width: 30, borderRadius: 4, background: v['--t-brd'] }} />
              <div style={{ height: 10, width: 34, borderRadius: 4, background: v['--t-success'] }} />
            </div>
          </div>
          {/* Sidebar col */}
          <div style={{ width: 28, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ height: 5, borderRadius: 2, background: v['--t-muted'], opacity: 0.3 }} />
            <div style={{ height: 12, borderRadius: 4, background: v['--t-surf2'], border: `1px solid ${v['--t-brd']}` }} />
            <div style={{ height: 5, borderRadius: 2, background: v['--t-muted'], opacity: 0.3 }} />
            <div style={{ height: 12, borderRadius: 4, background: v['--t-surf2'], border: `1px solid ${v['--t-brd']}` }} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function ThemePicker({ onBack }: Props) {
  const themeId = useStore(s => s.themeId);
  const setTheme = useStore(s => s.setTheme);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--t-bg)', overflow: 'auto' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '18px 36px', borderBottom: '1px solid var(--t-brd)',
        background: 'var(--t-surf)', flexShrink: 0,
      }}>
        <button
          onClick={onBack}
          style={{
            border: '1px solid var(--t-brd)', background: 'var(--t-surf)',
            color: 'var(--t-txt2)', fontSize: 13.5, fontWeight: 600,
            padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
          }}
        >
          ← Back to Settings
        </button>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--t-txt)' }}>Appearance</div>
          <div style={{ fontSize: 13, color: 'var(--t-muted)', marginTop: 1 }}>Choose a color scheme. Changes apply immediately.</div>
        </div>
      </div>

      {/* Grid */}
      <div style={{ padding: '32px 36px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
        {THEMES.map(t => {
          const active = themeId === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTheme(t.id)}
              style={{
                display: 'flex', flexDirection: 'column', gap: 12,
                padding: 16, borderRadius: 14, cursor: 'pointer', textAlign: 'left',
                border: active ? '2px solid var(--t-acc)' : '2px solid var(--t-brd)',
                background: active ? 'var(--t-acc-bg)' : 'var(--t-surf)',
                boxShadow: active ? '0 0 0 3px var(--t-acc-fo)' : '0 1px 3px rgba(0,0,0,0.06)',
                transition: 'all 0.15s',
              }}
            >
              <ThemePreview t={t} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t-txt)' }}>{t.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--t-muted)', marginTop: 2 }}>{t.description}</div>
                </div>
                {active && (
                  <div style={{
                    fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20,
                    background: 'var(--t-acc)', color: 'white', flexShrink: 0,
                  }}>
                    Active
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
