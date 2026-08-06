import { useState } from 'react';
import { useStore } from '../../store';
import type { Responsibility, ScheduleSpec } from '../../types';
import { summarizeResponsibility } from '../../responsibilities';
import { SchedulePicker } from '../SchedulePicker/SchedulePicker';

const card: React.CSSProperties = { background: 'var(--t-surf)', border: '1px solid var(--t-brd)', borderRadius: 12, padding: 20 };
const inp: React.CSSProperties = { flex: 1, fontSize: 13.5, padding: '8px 10px', borderRadius: 7, border: '1px solid var(--t-brd)', background: 'var(--t-surf2)', color: 'var(--t-txt)', boxSizing: 'border-box', width: '100%' };
const addBtn: React.CSSProperties = { border: 'none', background: 'var(--t-acc)', color: 'white', fontSize: 13.5, fontWeight: 600, padding: '8px 14px', borderRadius: 7, cursor: 'pointer' };
const ghostBtn: React.CSSProperties = { border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt2)', fontSize: 13, fontWeight: 500, padding: '7px 12px', borderRadius: 7, cursor: 'pointer' };
const fl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 };

interface DraftForm {
  name: string;
  description: string;
  recurrence: ScheduleSpec | null;
  templateTitle: string;
  templateDescription: string;
}

const EMPTY_DRAFT: DraftForm = {
  name: '',
  description: '',
  recurrence: null,
  templateTitle: '',
  templateDescription: '',
};

export function ResponsibilitiesSection() {
  const responsibilities = useStore(s => s.responsibilities);
  const addResponsibility = useStore(s => s.addResponsibility);
  const updateResponsibility = useStore(s => s.updateResponsibility);
  const removeResponsibility = useStore(s => s.removeResponsibility);
  const toggleActive = useStore(s => s.toggleResponsibilityActive);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<DraftForm>(EMPTY_DRAFT);

  function startEdit(r: Responsibility) {
    setEditingId(r.id);
    setAdding(false);
    setDraft({
      name: r.name,
      description: r.description,
      recurrence: r.recurrence,
      templateTitle: r.taskTemplate.title,
      templateDescription: r.taskTemplate.description,
    });
  }
  function startAdd() {
    setAdding(true);
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
  }
  function cancelForm() {
    setEditingId(null);
    setAdding(false);
    setDraft(EMPTY_DRAFT);
  }
  function saveForm() {
    if (!draft.name.trim() || !draft.recurrence) return;
    if (editingId) {
      updateResponsibility(editingId, {
        name: draft.name.trim(),
        description: draft.description,
        recurrence: draft.recurrence,
        taskTemplate: { title: draft.templateTitle, description: draft.templateDescription },
      });
    } else {
      addResponsibility({
        name: draft.name.trim(),
        description: draft.description,
        recurrence: draft.recurrence,
        taskTemplate: { title: draft.templateTitle, description: draft.templateDescription },
      });
    }
    cancelForm();
  }
  function handleDelete(r: Responsibility) {
    if (!confirm(`Delete responsibility "${r.name}"? Tasks it already generated stay put.`)) return;
    removeResponsibility(r.id);
  }

  const formOpen = adding || editingId !== null;
  const canSave = draft.name.trim().length > 0 && !!draft.recurrence;

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Responsibilities</div>
        {!formOpen && (
          <button onClick={startAdd} style={addBtn}>+ Add responsibility</button>
        )}
      </div>
      <div style={{ fontSize: 13, color: 'var(--t-muted)', marginBottom: 16 }}>
        Recurring obligations that auto-create a Task when they come due (e.g. Lomda hours, Confluence upkeep, quarterly DevOps demo).
      </div>

      {responsibilities.length === 0 && !formOpen && (
        <div style={{ fontSize: 13, color: 'var(--t-muted)' }}>No responsibilities yet.</div>
      )}

      {responsibilities.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: formOpen ? 16 : 0 }}>
          {responsibilities.map(r => {
            const isEditing = editingId === r.id;
            if (isEditing) return null; // form shows instead below
            const lastLabel = r.lastTriggeredAt
              ? new Date(r.lastTriggeredAt).toLocaleDateString()
              : 'never';
            return (
              <div key={r.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 14px', background: 'var(--t-surf2)',
                border: '1px solid var(--t-brd2)', borderRadius: 9,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: r.active ? 'var(--t-txt)' : 'var(--t-muted)' }}>{r.name}</span>
                    {!r.active && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 20, background: 'var(--t-surf3)', color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Paused</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--t-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {summarizeResponsibility(r)} · last {lastLabel}
                  </div>
                </div>
                <button onClick={() => toggleActive(r.id)} style={ghostBtn} title={r.active ? 'Pause — stops generating tasks' : 'Resume'}>
                  {r.active ? 'Pause' : 'Resume'}
                </button>
                <button onClick={() => startEdit(r)} style={ghostBtn}>Edit</button>
                <span onClick={() => handleDelete(r)} title="Delete" style={{ cursor: 'pointer', color: 'var(--t-muted)', fontSize: 16, padding: '0 6px' }}>×</span>
              </div>
            );
          })}
        </div>
      )}

      {formOpen && (
        <div style={{
          padding: 16, background: 'var(--t-surf2)',
          border: '1px solid var(--t-brd)', borderRadius: 10,
          display: 'flex', flexDirection: 'column', gap: 14,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-txt2)' }}>
            {editingId ? 'Edit responsibility' : 'New responsibility'}
          </div>
          <div>
            <div style={fl}>Name</div>
            <input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="Lomda hours" style={inp} />
          </div>
          <div>
            <div style={fl}>Description</div>
            <textarea value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} rows={2} placeholder="What this obligation covers" style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} />
          </div>
          <div>
            <div style={fl}>Recurrence</div>
            <SchedulePicker
              value={draft.recurrence}
              onChange={s => setDraft(d => ({ ...d, recurrence: s }))}
            />
          </div>
          <div style={{ borderTop: '1px dashed var(--t-brd)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 12, color: 'var(--t-muted)' }}>Task template (used when this fires — defaults to the name)</div>
            <div>
              <div style={fl}>Task title</div>
              <input value={draft.templateTitle} onChange={e => setDraft({ ...draft, templateTitle: e.target.value })} placeholder={draft.name || 'Same as name'} style={inp} />
            </div>
            <div>
              <div style={fl}>Task description</div>
              <textarea value={draft.templateDescription} onChange={e => setDraft({ ...draft, templateDescription: e.target.value })} rows={2} placeholder="Optional" style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={cancelForm} style={ghostBtn}>Cancel</button>
            <button onClick={saveForm} disabled={!canSave} style={{ ...addBtn, opacity: canSave ? 1 : 0.5, cursor: canSave ? 'pointer' : 'not-allowed' }}>
              {editingId ? 'Save changes' : 'Create'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
