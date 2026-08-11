import { useState, useEffect, useRef } from 'react';
import { useStore } from '../../store';
import type { Task, WaitingForTable } from '../../types';

interface Props {
  task: Task;
}

const DEFAULT_COLUMNS = ['Waiting for', 'From'];

// Collapsible "Waiting for" table on a card. Two columns by default, "+" in
// the header adds more. Rows strike out via the ✓ toggle; when every row is
// struck (or there are none) the section auto-collapses.
export function WaitingForSection({ task }: Props) {
  const updateItem = useStore(s => s.updateItem);
  const wf: WaitingForTable = task.waitingFor ?? { columns: DEFAULT_COLUMNS, rows: [] };
  const openRows = wf.rows.filter(r => !r.done).length;

  const [open, setOpen] = useState(openRows > 0);
  const [editingCol, setEditingCol] = useState<number | null>(null);
  const [colDraft, setColDraft] = useState('');

  // Auto-collapse when the last open row gets struck; auto-expand when an
  // open row (re)appears. Manual toggling still works in between.
  const prevOpenRows = useRef(openRows);
  useEffect(() => {
    if (prevOpenRows.current > 0 && openRows === 0) setOpen(false);
    if (prevOpenRows.current === 0 && openRows > 0) setOpen(true);
    prevOpenRows.current = openRows;
  }, [openRows]);
  useEffect(() => {
    const rows = task.waitingFor?.rows ?? [];
    setOpen(rows.some(r => !r.done));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id]);

  function save(next: WaitingForTable) {
    updateItem(task.id, { waitingFor: next });
  }

  function addRow() {
    const row = { id: 'w' + Date.now() + Math.random().toString(36).slice(2, 5), cells: wf.columns.map(() => ''), done: false };
    save({ ...wf, rows: [...wf.rows, row] });
    setOpen(true);
  }
  function addColumn() {
    save({
      columns: [...wf.columns, `Column ${wf.columns.length + 1}`],
      rows: wf.rows.map(r => ({ ...r, cells: [...r.cells, ''] })),
    });
  }
  function setCell(rowId: string, colIdx: number, value: string) {
    save({ ...wf, rows: wf.rows.map(r => r.id === rowId ? { ...r, cells: r.cells.map((c, i) => i === colIdx ? value : c) } : r) });
  }
  function toggleRow(rowId: string) {
    save({ ...wf, rows: wf.rows.map(r => r.id === rowId ? { ...r, done: !r.done } : r) });
  }
  function deleteRow(rowId: string) {
    save({ ...wf, rows: wf.rows.filter(r => r.id !== rowId) });
  }
  function renameColumn(idx: number, name: string) {
    save({ ...wf, columns: wf.columns.map((c, i) => i === idx ? (name.trim() || c) : c) });
  }

  const hdrSt: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'text', padding: '2px 0' };
  const cellInp: React.CSSProperties = { width: '100%', fontSize: 13, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--t-brd)', background: 'var(--t-surf2)', color: 'var(--t-txt)', boxSizing: 'border-box', outline: 'none' };

  return (
    <div style={{ border: '1px solid var(--t-brd)', borderRadius: 10, background: 'var(--t-surf)' }}>
      {/* Header / toggle */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', width: '100%', gap: 8, padding: '10px 14px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--t-txt2)', textAlign: 'left' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Waiting for</span>
        {openRows > 0 && (
          <span style={{ fontSize: 11, fontWeight: 700, padding: '1px 8px', borderRadius: 20, background: 'var(--t-amber-bg)', color: 'var(--t-amber)' }}>{openRows}</span>
        )}
        {openRows === 0 && wf.rows.length > 0 && (
          <span style={{ fontSize: 11, color: 'var(--t-muted)' }}>all resolved</span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--t-muted)', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>▸</span>
      </button>

      {open && (
        <div style={{ padding: '2px 14px 12px' }}>
          {/* Column headers + add-column */}
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${wf.columns.length}, 1fr) 24px 24px`, gap: 6, alignItems: 'center', marginBottom: 6 }}>
            {wf.columns.map((col, i) => (
              editingCol === i ? (
                <input key={i} autoFocus value={colDraft}
                  onChange={e => setColDraft(e.target.value)}
                  onBlur={() => { renameColumn(i, colDraft); setEditingCol(null); }}
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditingCol(null); }}
                  style={{ ...hdrSt, cursor: 'auto', border: 'none', outline: '1px solid var(--t-acc)', borderRadius: 3, padding: '2px 5px', background: 'transparent', width: '100%' }} />
              ) : (
                <div key={i} style={hdrSt} title="Click to rename" onClick={() => { setEditingCol(i); setColDraft(col); }}>{col}</div>
              )
            ))}
            <button onClick={addColumn} title="Add column"
              style={{ border: 'none', background: 'transparent', color: 'var(--t-muted)', fontSize: 15, fontWeight: 700, cursor: 'pointer', lineHeight: 1, padding: 0 }}>+</button>
            <span />
          </div>

          {/* Rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {wf.rows.map(row => (
              <div key={row.id} style={{ display: 'grid', gridTemplateColumns: `repeat(${wf.columns.length}, 1fr) 24px 24px`, gap: 6, alignItems: 'center', opacity: row.done ? 0.55 : 1 }}>
                {wf.columns.map((_, i) => (
                  <input key={i}
                    value={row.cells[i] ?? ''}
                    onChange={e => setCell(row.id, i, e.target.value)}
                    placeholder="—"
                    style={{ ...cellInp, textDecoration: row.done ? 'line-through' : 'none', color: row.done ? 'var(--t-muted)' : 'var(--t-txt)' }} />
                ))}
                <span
                  onClick={() => toggleRow(row.id)}
                  title={row.done ? 'Unresolve — back to waiting' : 'Resolved — strike out'}
                  style={{ cursor: 'pointer', fontSize: 14, fontWeight: 700, textAlign: 'center', color: row.done ? 'oklch(0.5 0.13 150)' : 'var(--t-brd)', userSelect: 'none' }}>
                  ✓
                </span>
                <span onClick={() => deleteRow(row.id)} title="Remove"
                  style={{ cursor: 'pointer', fontSize: 14, textAlign: 'center', color: 'var(--t-muted)', userSelect: 'none' }}>×</span>
              </div>
            ))}
          </div>

          <button onClick={addRow}
            style={{ marginTop: 8, width: '100%', border: '1px dashed var(--t-brd)', background: 'transparent', color: 'var(--t-muted)', fontSize: 12, fontWeight: 500, padding: '5px 0', borderRadius: 6, cursor: 'pointer' }}>
            + Add row
          </button>
        </div>
      )}
    </div>
  );
}
