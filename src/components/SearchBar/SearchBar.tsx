import { useState, useRef, useEffect } from 'react';
import { useStore } from '../../store';
import type { Item, Task } from '../../types';

const KIND_LABEL: Record<string, string> = {
  task: 'Task', reminder: 'Reminder', responsibility: 'Responsibility',
};
const KIND_COLOR: Record<string, string> = {
  task: 'var(--t-txt2)', reminder: 'var(--t-amber)', responsibility: 'var(--t-acc)',
};

interface Props {
  onPin: (id: string) => void;
  onQuickCreate: (title: string) => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}

export function SearchBar({ onPin, onQuickCreate, inputRef: externalRef }: Props) {
  const items = useStore(s => s.items);
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const internalRef = useRef<HTMLInputElement>(null);
  const inputRef = externalRef ?? internalRef;
  const containerRef = useRef<HTMLDivElement>(null);

  const q = query.trim().toLowerCase();
  const results: Item[] = !q ? [] : items.filter(it => {
    if (it.archived) return false;
    if (it.title.toLowerCase().includes(q)) return true;
    if (it.kind === 'task' && (it as Task).requester?.toLowerCase().includes(q)) return true;
    return false;
  }).slice(0, 6);
  const open = focused && q.length > 0;

  useEffect(() => {
    if (open && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setDropUp(window.innerHeight - rect.bottom < (results.length + 1) * 46 + 16);
    }
  }, [open, results.length]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setFocused(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function handleSelect(item: Item) { onPin(item.id); setQuery(''); setFocused(false); inputRef.current?.blur(); }
  function handleCreate() { onQuickCreate(query.trim()); setQuery(''); setFocused(false); inputRef.current?.blur(); }

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', marginTop: 10 }}>
      <div style={{ position: 'relative' }}>
        <span style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: 'var(--t-muted)', fontSize: 17, pointerEvents: 'none' }}>⌕</span>
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onKeyDown={e => {
            if (e.key === 'Escape') { setQuery(''); setFocused(false); }
            if (e.key === 'Enter' && q.length > 0) handleCreate();
          }}
          placeholder="Search items or type to quick-add a task…"
          style={{
            width: '100%', fontSize: 15, padding: '13px 40px 13px 44px', borderRadius: 12,
            border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt)',
            boxSizing: 'border-box', outline: 'none',
            boxShadow: focused ? '0 0 0 2px var(--t-acc-fo)' : '0 1px 3px rgba(0,0,0,0.05)',
            transition: 'box-shadow 0.1s',
          }}
        />
        {query && (
          <span onClick={() => { setQuery(''); inputRef.current?.focus(); }}
            style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--t-muted)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</span>
        )}
      </div>

      {open && (
        <div style={{
          position: 'absolute',
          ...(dropUp ? { bottom: 'calc(100% + 6px)', top: 'auto' } : { top: 'calc(100% + 6px)', bottom: 'auto' }),
          left: 0, right: 0, zIndex: 40,
          background: 'var(--t-surf)', border: '1px solid var(--t-brd)', borderRadius: 12,
          boxShadow: dropUp ? '0 -4px 20px rgba(0,0,0,0.12)' : '0 4px 20px rgba(0,0,0,0.12)',
          overflow: 'hidden',
        }}>
          {results.map(item => (
            <div key={item.id} onMouseDown={e => { e.preventDefault(); handleSelect(item); }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 16px', cursor: 'pointer', borderBottom: '1px solid var(--t-brd2)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--t-surf2)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'var(--t-surf)')}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, color: 'var(--t-txt)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</div>
                {item.kind === 'task' && (item as Task).requester && (
                  <div style={{ fontSize: 11, color: 'var(--t-muted)', marginTop: 1 }}>{(item as Task).requester}</div>
                )}
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: KIND_COLOR[item.kind], flexShrink: 0, marginLeft: 12 }}>
                {KIND_LABEL[item.kind]}
              </span>
            </div>
          ))}
          <div onMouseDown={e => { e.preventDefault(); handleCreate(); }}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 16px', cursor: 'pointer', color: 'var(--t-acc)', borderTop: results.length > 0 ? '1px solid var(--t-brd2)' : 'none', background: results.length === 0 ? 'var(--t-acc-bg)' : 'var(--t-surf)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--t-acc-bg)')}
            onMouseLeave={e => (e.currentTarget.style.background = results.length === 0 ? 'var(--t-acc-bg)' : 'var(--t-surf)')}>
            <span style={{ fontSize: 18, fontWeight: 700, lineHeight: 1 }}>+</span>
            <span style={{ fontSize: 14, fontWeight: 500 }}>Create task "<span style={{ fontStyle: 'italic' }}>{query.trim()}</span>"</span>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--t-acc-dk)', background: 'var(--t-acc-bg)', padding: '2px 7px', borderRadius: 6, flexShrink: 0 }}>↵ Enter</span>
          </div>
        </div>
      )}
    </div>
  );
}
