import { useStore, type View } from '../../store';
import type { SyncState } from '../../App';
import { flaggedTasks } from '../../greenPlay';
import type { Task } from '../../types';

const NAV: { key: View; label: string; icon: string }[] = [
  { key: 'feed', label: 'Card Feed', icon: '🂡' },
  { key: 'explore', label: 'Explore', icon: '⌕' },
  { key: 'kanban', label: 'Kanban', icon: '⫴' },
  { key: 'table', label: 'Table', icon: '☰' },
  { key: 'archive', label: 'Archive', icon: '🗑' },
  { key: 'docs', label: 'Docs', icon: '▤' },
  { key: 'settings', label: 'Settings', icon: '⚙' },
];

interface Props {
  onNewItem: () => void;
  onOpenReview: () => void;
  syncState: SyncState;
}

export function Sidebar({ onNewItem, onOpenReview, syncState }: Props) {
  const view = useStore(s => s.view);
  const setView = useStore(s => s.setView);
  const setDisplayId = useStore(s => s.setDisplayId);
  const collapsed = useStore(s => s.sidebarCollapsed);
  const setSidebarCollapsed = useStore(s => s.setSidebarCollapsed);
  const promotionsToday = useStore(s => s.promotionsToday);
  const promotionGoal = useStore(s => s.promotionGoal);
  const items = useStore(s => s.items);
  const reviewSession = useStore(s => s.reviewSession);
  // Badge count mirrors what the review popup will actually show on open:
  // any un-walked cards left in the session PLUS any newly-flagged tasks
  // that aren't in the session yet (they'll be appended by
  // syncReviewSessionWithFlags when the popup mounts).
  const mailCount = items.filter(it => it.kind === 'task' && it.type === 'mail' && !it.archived).length;
  // Plan badge counts today's tasks still AWAITING planning — a task marked
  // planned (plannedAt today) leaves the count, so it hits 0 when done.
  const sod = new Date(); sod.setHours(0, 0, 0, 0);
  const todayCount = items.filter(it =>
    it.kind === 'task' && (it as Task).forToday && !it.archived &&
    ((it as Task).plannedAt ?? 0) < sod.getTime()
  ).length;
  const flaggedCount = (() => {
    const flagged = flaggedTasks(items);
    if (!reviewSession) return flagged.length;
    // Only the REMAINING session cards are "already queued" — a card walked
    // earlier in the session that got edited since is flagged again and must
    // count (it rejoins the session on next open).
    const remainingIds = new Set(reviewSession.taskIds.slice(reviewSession.cardIdx));
    const remainingInSession = [...remainingIds].filter(id => items.some(it => it.id === id)).length;
    const newFlagged = flagged.filter(t => !remainingIds.has(t.id)).length;
    return remainingInSession + newFlagged;
  })();

  const pieCount = Math.min(promotionsToday, promotionGoal);
  const pieDeg = Math.round((pieCount / promotionGoal) * 360);
  const goalMet = pieCount >= promotionGoal;
  const pieColor = goalMet ? 'oklch(0.6 0.14 150)' : 'oklch(0.5 0.15 264)';

  const width = collapsed ? '44px' : '220px';

  return (
    <div
      onClick={() => setSidebarCollapsed(!collapsed)}
      style={{
        width, background: 'var(--t-surf, #ffffff)', borderRight: '1px solid var(--t-brd, #e6e3dc)',
        display: 'flex', flexDirection: 'column',
        padding: collapsed ? '16px 6px' : '20px 14px',
        gap: 2,
        transition: 'width 0.15s ease, padding 0.15s ease',
        boxSizing: 'border-box', overflow: 'hidden',
        cursor: 'pointer',
        // Fixed so it stays visible regardless of any scroll context. The
        // content wrapper compensates with margin-left of the same width.
        position: 'fixed', left: 0, top: 0, height: '100vh', zIndex: 30,
      }}
    >

      {/* Top: logo — clicking navigates to the top of the card feed */}
      <div
        onClick={e => { e.stopPropagation(); setDisplayId(null); setView('feed'); }}
        title="Go to card feed"
        style={{
          display: 'flex', alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          paddingBottom: 18,
          cursor: 'pointer',
        }}>
        {collapsed ? (
          <div style={{
            width: 28, height: 28, borderRadius: 7,
            background: 'var(--t-acc, oklch(0.5 0.15 264))',
            color: 'white', fontSize: 13, fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            userSelect: 'none', letterSpacing: '-0.03em', flexShrink: 0,
          }}>TF</div>
        ) : (
          <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-0.02em', whiteSpace: 'nowrap', userSelect: 'none' }}>TaskFlow</div>
        )}
      </div>

      {/* Nav items */}
      {NAV.map((nav, i) => {
        const active = view === nav.key;
        return (
          <div
            key={nav.key}
            onClick={e => { e.stopPropagation(); setView(nav.key); }}
            title={`${nav.label} — press ${i + 1}`}
            style={{
              padding: collapsed ? '8px 0' : '9px 10px',
              borderRadius: 8,
              fontSize: collapsed ? 16 : 14,
              fontWeight: active ? 600 : 500,
              cursor: 'pointer',
              color: active ? 'var(--t-acc-dk, oklch(0.4 0.14 264))' : 'var(--t-txt2, #48453e)',
              background: active ? 'var(--t-acc-bg, oklch(0.94 0.02 264))' : 'transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: collapsed ? 'center' : 'flex-start',
              gap: 10,
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ lineHeight: 1 }}>{nav.icon}</span>
            {!collapsed && <span>{nav.label}</span>}
          </div>
        );
      })}

      <div style={{ flex: 1 }} />

      {/* Communication assistant (mail capture) */}
      <button
        onClick={e => { e.stopPropagation(); window.location.hash = 'mail'; }}
        title={collapsed ? `Mail assistant (${mailCount})` : undefined}
        style={{
          border: '1px solid var(--t-brd)', background: 'var(--t-surf2)', color: 'var(--t-txt2)',
          fontSize: collapsed ? 15 : 13, fontWeight: 600,
          padding: collapsed ? '7px 0' : '8px 14px', borderRadius: 9, cursor: 'pointer',
          marginBottom: 8, whiteSpace: 'nowrap', width: '100%', lineHeight: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          position: 'relative',
        }}>
        <span style={{ fontSize: collapsed ? 14 : 12 }}>✉</span>
        {!collapsed && <span>Mail</span>}
        {mailCount > 0 && (
          <span style={{
            position: 'absolute', top: -5, right: -5,
            minWidth: 17, height: 17, padding: '0 4px', boxSizing: 'border-box',
            borderRadius: 999, background: 'var(--t-urgent)', color: 'white',
            fontSize: 10, fontWeight: 700, lineHeight: 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid var(--t-surf)',
          }}>{mailCount > 99 ? '99+' : mailCount}</span>
        )}
      </button>

      {/* Sprint (war mode) */}
      <button
        onClick={e => { e.stopPropagation(); window.location.hash = 'sprint'; }}
        title={collapsed ? 'Sprint — blitz everything quick' : 'Blitz everything quick, one item at a time'}
        style={{
          border: '1px solid var(--t-txt)', background: 'var(--t-txt)', color: 'var(--t-bg)',
          fontSize: collapsed ? 15 : 13, fontWeight: 700,
          padding: collapsed ? '7px 0' : '8px 14px', borderRadius: 9, cursor: 'pointer',
          marginBottom: 8, whiteSpace: 'nowrap', overflow: 'hidden', width: '100%', lineHeight: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
        <span style={{ fontSize: collapsed ? 13 : 10 }}>▶</span>
        {!collapsed && <span>Sprint</span>}
      </button>

      {/* Green Play review button */}
      <button
        onClick={e => { e.stopPropagation(); onOpenReview(); }}
        title={collapsed ? `Review (${flaggedCount})` : undefined}
        disabled={flaggedCount === 0}
        style={{
          border: 'none',
          background: flaggedCount > 0 ? 'oklch(0.6 0.14 150)' : 'var(--t-brd)',
          color: flaggedCount > 0 ? 'white' : 'var(--t-muted)',
          fontSize: collapsed ? 15 : 13,
          fontWeight: 600,
          padding: collapsed ? '7px 0' : '8px 14px',
          borderRadius: 9,
          cursor: flaggedCount > 0 ? 'pointer' : 'default',
          marginBottom: 8,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          width: '100%',
          lineHeight: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}
      >
        <span style={{ fontSize: collapsed ? 14 : 11 }}>▶</span>
        {!collapsed && <span>Review</span>}
        {flaggedCount > 0 && (
          <span style={{
            fontSize: 11, fontWeight: 700,
            padding: '2px 6px', borderRadius: 999,
            background: 'rgba(255,255,255,0.25)', color: 'white',
            lineHeight: 1,
          }}>{flaggedCount}</span>
        )}
      </button>

      {/* Plan — write today's steps */}
      <button
        onClick={e => { e.stopPropagation(); window.location.hash = 'plan'; }}
        title={collapsed ? `Plan (${todayCount} today)` : 'Write the steps for today\'s tasks'}
        style={{
          border: '1px solid var(--t-kind-reminder)', background: 'var(--t-kind-reminder-bg)', color: 'var(--t-kind-reminder)',
          fontSize: collapsed ? 15 : 13, fontWeight: 600,
          padding: collapsed ? '7px 0' : '8px 14px', borderRadius: 9, cursor: 'pointer',
          marginBottom: 8, whiteSpace: 'nowrap', overflow: 'hidden', width: '100%', lineHeight: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
        <span style={{ fontSize: collapsed ? 14 : 12 }}>◷</span>
        {!collapsed && <span>Plan</span>}
        {!collapsed && todayCount > 0 && (
          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: 'var(--t-kind-reminder)', color: 'var(--t-surf)' }}>{todayCount}</span>
        )}
      </button>

      {/* New item button */}
      <button
        onClick={e => { e.stopPropagation(); onNewItem(); }}
        title={collapsed ? 'New item' : undefined}
        style={{
          border: 'none',
          background: 'var(--t-acc, oklch(0.5 0.15 264))',
          color: 'white',
          fontSize: collapsed ? 18 : 14,
          fontWeight: 600,
          padding: collapsed ? '8px 0' : '10px 14px',
          borderRadius: 9,
          cursor: 'pointer',
          marginBottom: 12,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          width: '100%',
          lineHeight: 1,
        }}
      >
        {collapsed ? '+' : '+ New item'}
      </button>

      {/* Promotions + snoozes + sync footer */}
      <div style={{
        paddingTop: 10,
        borderTop: '1px solid #efece5',
        display: 'flex',
        flexDirection: 'column',
        alignItems: collapsed ? 'center' : 'stretch',
        gap: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} title={collapsed ? `${pieCount}/${promotionGoal} promotions` : undefined}>
          <div style={{
            width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
            background: `conic-gradient(${pieColor} ${pieDeg}deg, #ece9e2 0deg)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{ width: 17, height: 17, borderRadius: '50%', background: 'var(--t-surf)' }} />
          </div>
          {!collapsed && (
            <div style={{ fontSize: 12, color: 'var(--t-muted)', whiteSpace: 'nowrap' }}>
              <span style={{ fontWeight: 600, color: 'var(--t-txt2)' }}>{pieCount}/{promotionGoal} today</span>
            </div>
          )}
        </div>

        {/* Sync indicator — always visible */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          justifyContent: collapsed ? 'center' : 'flex-start',
        }} title={syncState === 'syncing' ? 'Saving…' : 'Saved'}>
          {syncState === 'syncing' ? (
            <>
              <span style={{ display: 'inline-block', fontSize: 13, animation: 'spin 0.8s linear infinite', color: 'var(--t-muted)' }}>↻</span>
              {!collapsed && <span style={{ fontSize: 11, color: 'var(--t-muted)' }}>Saving…</span>}
            </>
          ) : (
            <>
              <span style={{ fontSize: 13, color: 'var(--t-success)' }}>✓</span>
              {!collapsed && <span style={{ fontSize: 11, color: 'var(--t-success)' }}>Saved</span>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
