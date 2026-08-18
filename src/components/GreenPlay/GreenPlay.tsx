import { useState, useEffect, useMemo, useRef, useLayoutEffect, useCallback } from 'react';
import { backdropCloseProps } from '../../backdrop';
import { useStore } from '../../store';
import type { Task, ItsmConfig } from '../../types';
import { flaggedTasks, stepsFor, type Step } from '../../greenPlay';
import { EstimatesSection } from '../Common/EstimatesSection';
import { CommunicationSection, getCommunications } from '../Common/CommunicationSection';
import { createJiraIssue, addJiraComment, closeJiraIssue } from '../../jira';
import { ApiUnreachableError } from '../../apiLog';
import { getDefaultJiraConfig, getJiraConfigForKey, applySummaryTemplate, buildJiraCreateUrl } from '../../jiraHosts';
import { itsmTicketUrl } from '../../itsm';

interface Props {
  onClose: () => void;
}

interface ArrowGeom {
  from: { x: number; y: number };
  to: { x: number; y: number };
  targetRect: DOMRect | null;
}

export function GreenPlay({ onClose }: Props) {
  const items = useStore(s => s.items);
  const jiraConfigs = useStore(s => s.jiraConfigs);
  const defaultJira = getDefaultJiraConfig(jiraConfigs);
  const requesterJiraIds = useStore(s => s.requesterJiraIds);
  const itsmConfig = useStore(s => s.itsmConfig);
  const updateItem = useStore(s => s.updateItem);
  const addSubtask = useStore(s => s.addSubtask);
  const toggleSubtaskDone = useStore(s => s.toggleSubtaskDone);
  const markTaskReviewed = useStore(s => s.markTaskReviewed);
  const reviewSession = useStore(s => s.reviewSession);
  const syncReviewSessionWithFlags = useStore(s => s.syncReviewSessionWithFlags);
  const updateReviewProgress = useStore(s => s.updateReviewProgress);
  const endReview = useStore(s => s.endReview);

  // Bootstrap on mount: either start a fresh session with the currently-flagged
  // tasks, or (if the user closed a prior session mid-review) append any newly-
  // flagged task IDs to the existing session so new work created between
  // sessions gets picked up. cardIdx/stepIdx are preserved when resuming.
  useEffect(() => {
    const flagged = flaggedTasks(items);
    const initial: Record<string, number> = {};
    for (const it of items) {
      if (it.kind === 'task') {
        // Fallback to createdAt so a never-reviewed task doesn't paint every
        // subtask green (they came with the task, they aren't "new").
        initial[it.id] = (it as Task).reviewedAt ?? (it as Task).createdAt;
      }
    }
    syncReviewSessionWithFlags(flagged.map(t => t.id), initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const frozenTaskIds = reviewSession?.taskIds ?? [];
  const cardIdx = reviewSession?.cardIdx ?? 0;
  const stepIdx = reviewSession?.stepIdx ?? 0;
  const initialReviewedAt = reviewSession?.initialReviewedAt ?? {};

  const tasks: Task[] = useMemo(() => {
    // Look up the frozen ids against the current items list (so live edits
    // are reflected in what the user sees). Deleted items get filtered.
    return frozenTaskIds
      .map(id => items.find(it => it.id === id))
      .filter((it): it is Task => !!it && it.kind === 'task');
  }, [frozenTaskIds, items]);

  const currentTask: Task | undefined = tasks[cardIdx];
  const steps: Step[] = useMemo(() => currentTask ? stepsFor(currentTask) : [], [currentTask]);
  const currentStep: Step | undefined = steps[stepIdx];

  const cardScrollRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [arrow, setArrow] = useState<ArrowGeom | null>(null);
  const [creatingJira, setCreatingJira] = useState(false);
  const [jiraError, setJiraError] = useState<string | null>(null);
  const openJira = (url: string, _key: string) => window.open(url, '_blank');
  // "Create Jira" step: summary + description for the ticket about to be created.
  const [createJiraDesc, setCreateJiraDesc] = useState('');
  const [createJiraSummary, setCreateJiraSummary] = useState('');
  const [urlCreateStatus, setUrlCreateStatus] = useState<string | null>(null);
  // Host has a create-URL override → creation opens that URL in a new tab
  // (pre-filled Jira create screen) instead of calling the REST API.
  // "Update Jira" step: suggested comment text + posting state.
  const [jiraUpdateText, setJiraUpdateText] = useState('');
  const [addingComment, setAddingComment] = useState(false);
  const [commentStatus, setCommentStatus] = useState<string | null>(null);
  const [commentPickerOpen, setCommentPickerOpen] = useState(false);
  // "Close Jira" step: transition state.
  const [closingJira, setClosingJira] = useState(false);
  const [closeStatus, setCloseStatus] = useState<string | null>(null);
  const [closePickerOpen, setClosePickerOpen] = useState(false);

  // Called by the "Create Jira" step's action button. Uses the Jira config
  // stored in Settings; writes the resulting key back to the task's jiraLink.
  const handleCreateJira = useCallback(async () => {
    if (!currentTask || !defaultJira) return;
    setJiraError(null);
    const summary = createJiraSummary.trim() || currentTask.title;

    setCreatingJira(true);
    try {
      const result = await createJiraIssue(defaultJira, {
        summary,
        description: createJiraDesc,
        requestedBy: currentTask.requester ?? '',
        reporterAccountId: currentTask.requester ? requesterJiraIds[currentTask.requester] : undefined,
      });
      updateItem(currentTask.id, { jiraLink: result.key, description: createJiraDesc });
    } catch (err) {
      // API unreachable (no proxy + CORS): fall back to the host's pre-filled
      // create URL when one is configured.
      const fallbackUrl = err instanceof ApiUnreachableError ? buildJiraCreateUrl(defaultJira, summary, createJiraDesc) : null;
      if (fallbackUrl) {
        window.open(fallbackUrl, '_blank');
        updateItem(currentTask.id, { description: createJiraDesc });
        setUrlCreateStatus('Jira API unreachable — opened the pre-filled create form; paste the ticket key into the Jira field once created');
      } else {
        setJiraError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setCreatingJira(false);
    }
  }, [currentTask, defaultJira, requesterJiraIds, createJiraSummary, createJiraDesc, updateItem]);

  // Clear the transient jira states whenever we move to another step/card.
  useEffect(() => {
    setJiraError(null);
    setCloseStatus(null);
    setClosePickerOpen(false);
    setUrlCreateStatus(null);
  }, [stepIdx, cardIdx]);

  // Prefill the Create-Jira description with the task's stored description
  // and the summary from the host's summary template.
  useEffect(() => {
    if (currentStep?.kind === 'createJira' && currentTask) {
      setCreateJiraDesc(currentTask.description ?? '');
      setCreateJiraSummary(applySummaryTemplate(defaultJira, currentTask.title));
      setUrlCreateStatus(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTask?.id, currentStep?.kind]);

  // Prefill the "Update Jira" summary box: names of subtasks created since the
  // card's last review, plus the whole notes section when notes changed since
  // then. Both checks are pure store data (createdAt / notesChangedAt vs the
  // review baseline) — the forensic logs are never consulted.
  useEffect(() => {
    setCommentStatus(null);
    setCommentPickerOpen(false);
    if (currentStep?.kind !== 'updateJira' || !currentTask) { setJiraUpdateText(''); return; }
    const baseline = initialReviewedAt[currentTask.id] ?? currentTask.createdAt;
    const newSubs = currentTask.subtasks.filter(s => s.createdAt > baseline);
    const parts: string[] = [];
    if (newSubs.length) parts.push(`New subtasks:\n${newSubs.map(s => `- ${s.title}`).join('\n')}`);
    if (currentTask.notes?.trim() && (currentTask.notesChangedAt ?? 0) > baseline) {
      parts.push(`Notes:\n${currentTask.notes}`);
    }
    setJiraUpdateText(parts.join('\n\n'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTask?.id, currentStep?.kind]);

  async function postCloseJira(ticketKey: string) {
    const cfg = getJiraConfigForKey(jiraConfigs, ticketKey);
    if (!cfg) { setCloseStatus('No Jira host configured for this ticket.'); return; }
    setClosingJira(true);
    setCloseStatus(null);
    setClosePickerOpen(false);
    try {
      const statusName = await closeJiraIssue(cfg, ticketKey);
      setCloseStatus(`✓ ${ticketKey} moved to ${statusName}`);
    } catch (err) {
      setCloseStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setClosingJira(false);
    }
  }

  async function postComment(ticketKey: string) {
    const cfg = getJiraConfigForKey(jiraConfigs, ticketKey);
    if (!cfg) { setCommentStatus('No Jira host configured for this ticket.'); return; }
    setAddingComment(true);
    setCommentStatus(null);
    setCommentPickerOpen(false);
    try {
      await addJiraComment(cfg, ticketKey, jiraUpdateText.trim());
      setCommentStatus(`✓ Comment added to ${ticketKey}`);
    } catch (err) {
      setCommentStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setAddingComment(false);
    }
  }

  // Advance / rewind. When advancing past the LAST step of a card, mark that
  // specific card reviewed. Progress is written to the persisted session so
  // closing and reopening (or reloading the browser) resumes here.
  const goNextStep = useCallback(() => {
    if (stepIdx < steps.length - 1) {
      updateReviewProgress(cardIdx, stepIdx + 1);
      return;
    }
    if (currentTask) markTaskReviewed(currentTask.id);
    if (cardIdx < tasks.length - 1) {
      updateReviewProgress(cardIdx + 1, 0);
    } else {
      endReview();
      onClose();
    }
  }, [stepIdx, steps.length, cardIdx, tasks.length, currentTask, markTaskReviewed, endReview, onClose, updateReviewProgress]);

  const goPrevStep = useCallback(() => {
    if (stepIdx > 0) {
      updateReviewProgress(cardIdx, stepIdx - 1);
    } else if (cardIdx > 0) {
      const prevIdx = cardIdx - 1;
      const prevTask = tasks[prevIdx];
      const prevSteps = prevTask ? stepsFor(prevTask) : [];
      updateReviewProgress(prevIdx, Math.max(0, prevSteps.length - 1));
    }
  }, [stepIdx, cardIdx, tasks, updateReviewProgress]);

  // Closing mid-review does NOT clear the session — the popup unmounts but
  // the persisted taskIds/cardIdx/stepIdx stay so the next open resumes.
  const handleClose = useCallback(() => onClose(), [onClose]);

  // Keyboard — Space advances (Enter is reserved for the app's "Continue"
  // action on card buttons). Skip when focus is on a form control so Space
  // still toggles checkboxes, types into inputs, and clicks buttons.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); handleClose(); return; }
      const t = e.target as HTMLElement | null;
      const onFormControl = t && (
        t.tagName === 'INPUT' ||
        t.tagName === 'TEXTAREA' ||
        t.tagName === 'SELECT' ||
        t.tagName === 'BUTTON' ||
        t.isContentEditable
      );
      if (onFormControl) return;
      if (e.key === ' ' || e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault(); goNextStep();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault(); goPrevStep();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goNextStep, goPrevStep, handleClose]);

  // Compute arrow geometry.
  useLayoutEffect(() => {
    if (!currentStep || !panelRef.current) { setArrow(null); return; }
    const scope = cardScrollRef.current;
    if (!scope) { setArrow(null); return; }
    const target = scope.querySelector<HTMLElement>(`[data-review-target="${currentStep.target}"]`);
    if (!target) { setArrow(null); return; }

    // Scroll target into view first
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Give the scroll a moment to settle, then measure
    const compute = () => {
      const t = target.getBoundingClientRect();
      const p = panelRef.current!.getBoundingClientRect();
      const from = { x: p.left - 4, y: p.top + Math.min(80, p.height / 2) };
      const to = { x: t.right + 6, y: t.top + t.height / 2 };
      setArrow({ from, to, targetRect: t });
    };
    compute();
    const t1 = setTimeout(compute, 250);
    const t2 = setTimeout(compute, 550);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [currentStep, cardIdx]);

  // Recompute arrow on scroll/resize
  useEffect(() => {
    function recompute() {
      if (!currentStep || !panelRef.current) return;
      const scope = cardScrollRef.current;
      if (!scope) return;
      const target = scope.querySelector<HTMLElement>(`[data-review-target="${currentStep.target}"]`);
      if (!target) return;
      const t = target.getBoundingClientRect();
      const p = panelRef.current.getBoundingClientRect();
      const from = { x: p.left - 4, y: p.top + Math.min(80, p.height / 2) };
      const to = { x: t.right + 6, y: t.top + t.height / 2 };
      setArrow({ from, to, targetRect: t });
    }
    window.addEventListener('resize', recompute);
    const scope = cardScrollRef.current;
    scope?.addEventListener('scroll', recompute);
    return () => {
      window.removeEventListener('resize', recompute);
      scope?.removeEventListener('scroll', recompute);
    };
  }, [currentStep]);

  // First-render bootstrap in progress — beginReview hasn't fired yet.
  // Return nothing so the empty-state UI doesn't flash before the session
  // populates.
  if (reviewSession === null) return null;

  // Empty state — no flagged tasks at all (or all frozen tasks got deleted).
  // Also end the session so a fresh flagged set is picked up on next open.
  if (tasks.length === 0) {
    const clearAndClose = () => { endReview(); onClose(); };
    return (
      <div style={backdropSt} {...backdropCloseProps(clearAndClose)}>
        <div style={{ ...popupSt, width: 480 }} onClick={e => e.stopPropagation()}>
          <div style={{ padding: '48px 32px', textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>✓</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--t-txt)', marginBottom: 6 }}>All caught up</div>
            <div style={{ fontSize: 14, color: 'var(--t-muted)' }}>Nothing flagged for review.</div>
            <button onClick={clearAndClose} style={{ marginTop: 20, border: 'none', background: 'var(--t-acc)', color: 'white', fontSize: 13, fontWeight: 600, padding: '8px 16px', borderRadius: 7, cursor: 'pointer' }}>Close</button>
          </div>
        </div>
      </div>
    );
  }

  if (!currentTask) return null;

  const baseline = initialReviewedAt[currentTask.id] ?? currentTask.createdAt;
  const newSubtaskIds = new Set(
    currentTask.subtasks.filter(s => s.createdAt > baseline).map(s => s.id)
  );

  return (
    <div style={backdropSt} {...backdropCloseProps(handleClose)}>
      <div style={popupSt} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid var(--t-brd)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'oklch(0.5 0.13 150)', letterSpacing: '0.02em' }}>▶ REVIEW</span>
            <span style={{ fontSize: 13, color: 'var(--t-muted)' }}>
              Card {cardIdx + 1} of {tasks.length} · Step {stepIdx + 1} of {steps.length}
            </span>
          </div>
          <button onClick={handleClose} title="Close · remaining cards stay in the queue"
            style={{ border: 'none', background: 'transparent', fontSize: 20, color: 'var(--t-muted)', cursor: 'pointer', padding: '0 6px', lineHeight: 1 }}>×</button>
        </div>

        {/* Body: card + side panel */}
        <div style={{ flex: 1, display: 'flex', minHeight: 0, position: 'relative' }}>
          {/* Card area */}
          <div ref={cardScrollRef} style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: 24, background: 'var(--t-surf2)' }}>
            <ReviewCard
              task={currentTask}
              currentTarget={currentStep?.target}
              newSubtaskIds={newSubtaskIds}
              jiraOpenUrl={(key) => { const cfg = getJiraConfigForKey(jiraConfigs, key); return cfg ? `https://${cfg.host}/browse/${key}` : null; }}
              onOpenJira={openJira}
              itsmConfig={itsmConfig}
              onUpdate={patch => updateItem(currentTask.id, patch)}
              onAddSubtask={title => addSubtask(currentTask.id, title)}
              onToggleSubtaskDone={subId => toggleSubtaskDone(currentTask.id, subId)}
            />
          </div>

          {/* Side panel */}
          <div ref={panelRef} style={{ width: 320, flexShrink: 0, borderLeft: '1px solid var(--t-brd)', background: 'var(--t-surf)', display: 'flex', flexDirection: 'column', padding: '24px 22px', overflowY: 'auto' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'oklch(0.5 0.13 150)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
              Next step
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--t-txt)', marginBottom: 10, lineHeight: 1.2 }}>
              {currentStep?.label}
            </div>
            <div style={{ fontSize: 14, color: 'var(--t-txt2)', lineHeight: 1.5, marginBottom: 20 }}>
              {currentStep?.description}
            </div>

            {/* Breakdown step: coaching prompts */}
            {currentStep?.kind === 'breakdown' && (
              <div style={{ marginBottom: 20, padding: '12px 14px', background: 'var(--t-surf2)', border: '1px solid var(--t-brd)', borderRadius: 9 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                  Ask yourself
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7, fontSize: 13.5, color: 'var(--t-txt)', lineHeight: 1.45 }}>
                  <div>→ What is the <b>next step</b>? Is it a subtask — and starred?</div>
                  <div>→ Is this plan still <b>accurate</b>? Update what changed, check off what's done.</div>
                </div>
              </div>
            )}

            {/* Step-specific action */}
            {currentStep?.kind === 'createJira' && (
              <div style={{ marginBottom: 20 }}>
                {currentTask.jiraLink ? (
                  <div style={{ fontSize: 13, color: 'oklch(0.5 0.13 150)', padding: '10px 12px', border: '1px solid oklch(0.8 0.09 150)', background: 'oklch(0.96 0.05 150)', borderRadius: 8 }}>
                    ✓ Linked to <b>{currentTask.jiraLink}</b>
                  </div>
                ) : defaultJira ? (
                  <>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                      Jira summary
                    </div>
                    <input
                      value={createJiraSummary}
                      onChange={e => setCreateJiraSummary(e.target.value)}
                      placeholder={currentTask.title}
                      style={{ width: '100%', fontSize: 13, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--t-brd)', background: 'var(--t-surf2)', color: 'var(--t-txt)', boxSizing: 'border-box', outline: 'none', marginBottom: 8 }}
                    />
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                      Jira description
                    </div>
                    <textarea
                      value={createJiraDesc}
                      onChange={e => setCreateJiraDesc(e.target.value)}
                      rows={4}
                      placeholder="Describe the ticket…"
                      style={{ width: '100%', fontSize: 13, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--t-brd)', background: 'var(--t-surf2)', color: 'var(--t-txt)', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit', outline: 'none', marginBottom: 8 }}
                    />
                    <button onClick={handleCreateJira} disabled={creatingJira}
                      style={{ width: '100%', border: 'none', background: 'var(--t-acc)', color: 'white', fontSize: 14, fontWeight: 600, padding: '10px 14px', borderRadius: 8, cursor: creatingJira ? 'wait' : 'pointer', opacity: creatingJira ? 0.6 : 1 }}>
                      {creatingJira ? 'Creating…' : `+ Create in ${defaultJira.projectKey || defaultJira.host}`}
                    </button>
                    {urlCreateStatus && (
                      <div style={{ marginTop: 8, fontSize: 12, color: 'var(--t-acc-dk)', padding: '8px 10px', background: 'var(--t-acc-bg)', borderRadius: 6 }}>
                        {urlCreateStatus}
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ fontSize: 12, color: 'var(--t-muted)', padding: '10px 12px', border: '1px dashed var(--t-brd)', borderRadius: 8 }}>
                    Configure Jira in Settings to enable one-click creation.
                  </div>
                )}
                {jiraError && (
                  <div style={{ marginTop: 8, fontSize: 12, color: 'var(--t-urgent)', padding: '8px 10px', background: 'var(--t-urgent-bg)', borderRadius: 6 }}>
                    {jiraError}
                  </div>
                )}
              </div>
            )}

            {(currentStep?.kind === 'updateJira' || currentStep?.kind === 'closeJira') && currentTask.jiraLink && (() => {
              const cfg = getJiraConfigForKey(jiraConfigs, currentTask.jiraLink);
              if (!cfg) return null;
              return (
                <div style={{ marginBottom: 20 }}>
                  <button
                    onClick={() => openJira(`https://${cfg.host}/browse/${currentTask.jiraLink}`, currentTask.jiraLink)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', border: '1px solid var(--t-acc)', background: 'var(--t-acc-bg)', color: 'var(--t-acc-dk)', fontSize: 14, fontWeight: 600, padding: '9px 14px', borderRadius: 8, boxSizing: 'border-box', cursor: 'pointer' }}>
                    ↗ Open {currentTask.jiraLink} in Jira
                  </button>
                </div>
              );
            })()}

            {/* Close-Jira step: transition the ticket to done/resolved */}
            {currentStep?.kind === 'closeJira' && (() => {
              const tickets = [currentTask.jiraLink, ...(currentTask.extraJiraLinks ?? [])]
                .map(x => (x ?? '').trim()).filter(Boolean);
              if (tickets.length === 0) return null;
              return (
                <div style={{ marginBottom: 20 }}>
                  {!closePickerOpen ? (
                    <button
                      onClick={() => { if (tickets.length === 1) postCloseJira(tickets[0]); else setClosePickerOpen(true); }}
                      disabled={closingJira}
                      style={{ width: '100%', border: 'none', background: 'oklch(0.5 0.13 150)', color: 'white', fontSize: 13, fontWeight: 600, padding: '9px 0', borderRadius: 7, cursor: closingJira ? 'wait' : 'pointer', opacity: closingJira ? 0.6 : 1 }}>
                      {closingJira ? 'Closing…' : tickets.length > 1 ? '✓ Close Jira… (choose ticket)' : `✓ Close ${tickets[0]}`}
                    </button>
                  ) : (
                    <div style={{ border: '1px solid var(--t-brd)', borderRadius: 8, overflow: 'hidden' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '7px 10px', background: 'var(--t-surf2)' }}>
                        Close which ticket?
                      </div>
                      {tickets.map(k => (
                        <button key={k} onClick={() => postCloseJira(k)}
                          style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', border: 'none', borderTop: '1px solid var(--t-brd2)', background: 'var(--t-surf)', fontSize: 13, fontWeight: 600, color: 'oklch(0.4 0.14 150)', cursor: 'pointer' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'oklch(0.96 0.05 150)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'var(--t-surf)')}>
                          {k}
                        </button>
                      ))}
                      <button onClick={() => setClosePickerOpen(false)}
                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', border: 'none', borderTop: '1px solid var(--t-brd2)', background: 'var(--t-surf)', fontSize: 12, color: 'var(--t-muted)', cursor: 'pointer' }}>
                        Cancel
                      </button>
                    </div>
                  )}
                  {closeStatus && (
                    <div style={{ marginTop: 8, fontSize: 12, padding: '7px 10px', borderRadius: 6, background: closeStatus.startsWith('✓') ? 'oklch(0.96 0.05 150)' : 'var(--t-urgent-bg)', color: closeStatus.startsWith('✓') ? 'oklch(0.4 0.14 150)' : 'var(--t-urgent)' }}>
                      {closeStatus}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Update-Jira step: suggested comment + one-click post */}
            {currentStep?.kind === 'updateJira' && (() => {
              const tickets = [currentTask.jiraLink, ...(currentTask.extraJiraLinks ?? [])]
                .map(x => (x ?? '').trim()).filter(Boolean);
              const disabled = addingComment || !jiraUpdateText.trim() || tickets.length === 0;
              return (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                    Update summary
                  </div>
                  <textarea
                    value={jiraUpdateText}
                    onChange={e => setJiraUpdateText(e.target.value)}
                    rows={6}
                    placeholder="No new subtasks or note changes detected — write your update…"
                    style={{ width: '100%', fontSize: 13, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--t-brd)', background: 'var(--t-surf2)', color: 'var(--t-txt)', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit', outline: 'none' }}
                  />
                  {!commentPickerOpen ? (
                    <button
                      onClick={() => { if (tickets.length === 1) postComment(tickets[0]); else setCommentPickerOpen(true); }}
                      disabled={disabled}
                      style={{ marginTop: 8, width: '100%', border: 'none', background: 'var(--t-acc)', color: 'white', fontSize: 13, fontWeight: 600, padding: '9px 0', borderRadius: 7, cursor: addingComment ? 'wait' : 'pointer', opacity: disabled ? 0.5 : 1 }}>
                      {addingComment ? 'Adding…' : tickets.length > 1 ? 'Add comment… (choose ticket)' : 'Add comment to Jira'}
                    </button>
                  ) : (
                    <div style={{ marginTop: 8, border: '1px solid var(--t-brd)', borderRadius: 8, overflow: 'hidden' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '7px 10px', background: 'var(--t-surf2)' }}>
                        Comment on which ticket?
                      </div>
                      {tickets.map(k => (
                        <button key={k} onClick={() => postComment(k)}
                          style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', border: 'none', borderTop: '1px solid var(--t-brd2)', background: 'var(--t-surf)', fontSize: 13, fontWeight: 600, color: 'var(--t-acc-dk)', cursor: 'pointer' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--t-acc-bg)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'var(--t-surf)')}>
                          {k}
                        </button>
                      ))}
                      <button onClick={() => setCommentPickerOpen(false)}
                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', border: 'none', borderTop: '1px solid var(--t-brd2)', background: 'var(--t-surf)', fontSize: 12, color: 'var(--t-muted)', cursor: 'pointer' }}>
                        Cancel
                      </button>
                    </div>
                  )}
                  {commentStatus && (
                    <div style={{ marginTop: 8, fontSize: 12, padding: '7px 10px', borderRadius: 6, background: commentStatus.startsWith('✓') ? 'oklch(0.96 0.05 150)' : 'var(--t-urgent-bg)', color: commentStatus.startsWith('✓') ? 'oklch(0.4 0.14 150)' : 'var(--t-urgent)' }}>
                      {commentStatus}
                    </div>
                  )}
                </div>
              );
            })()}

            <div style={{ flex: 1 }} />

            {/* Progress dots */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
              {steps.map((s, i) => (
                <div key={i} title={s.label}
                  style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: i === stepIdx ? 'oklch(0.5 0.13 150)' : i < stepIdx ? 'oklch(0.6 0.14 150)' : 'var(--t-brd)',
                    transition: 'background 0.15s',
                  }} />
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={goPrevStep} disabled={stepIdx === 0 && cardIdx === 0}
                style={{
                  fontSize: 13, padding: '9px 14px', border: '1px solid var(--t-brd)',
                  background: 'var(--t-surf)', color: 'var(--t-txt2)', borderRadius: 7,
                  cursor: (stepIdx === 0 && cardIdx === 0) ? 'default' : 'pointer',
                  opacity: (stepIdx === 0 && cardIdx === 0) ? 0.4 : 1,
                }}>← Back</button>
              <button onClick={goNextStep}
                style={{
                  flex: 1, fontSize: 14, fontWeight: 600, padding: '9px 14px',
                  border: 'none', background: 'oklch(0.5 0.13 150)', color: 'white',
                  borderRadius: 7, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}>
                {stepIdx === steps.length - 1 && cardIdx === tasks.length - 1
                  ? 'Finish · Space'
                  : stepIdx === steps.length - 1 ? 'Next card · Space' : 'Next · Space'}
              </button>
            </div>
          </div>

          {/* Arrow overlay */}
          {arrow && (
            <ArrowOverlay from={arrow.from} to={arrow.to} />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Arrow ─────────────────────────────────────────────────────────

function ArrowOverlay({ from, to }: { from: { x: number; y: number }; to: { x: number; y: number } }) {
  const midX = (from.x + to.x) / 2;
  const c1 = { x: midX, y: from.y };
  const c2 = { x: midX, y: to.y };
  const path = `M ${from.x} ${from.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${to.x} ${to.y}`;
  return (
    <svg style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 60 }}>
      <defs>
        <marker id="gp-arrow-head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="oklch(0.5 0.13 150)" />
        </marker>
      </defs>
      <path d={path} stroke="oklch(0.5 0.13 150)" strokeWidth={2.5} fill="none" markerEnd="url(#gp-arrow-head)" strokeDasharray="6 4">
        <animate attributeName="stroke-dashoffset" from="0" to="-20" dur="0.8s" repeatCount="indefinite" />
      </path>
    </svg>
  );
}

// ── Review card ───────────────────────────────────────────────────

interface CardProps {
  task: Task;
  currentTarget: Step['target'] | undefined;
  newSubtaskIds: Set<string>;
  /** Resolves a ticket key to its URL via the multi-host config (null if none). */
  jiraOpenUrl: (key: string) => string | null;
  onOpenJira: (url: string, key: string) => void;
  itsmConfig: ItsmConfig | null;
  onUpdate: (patch: Partial<Task>) => void;
  onAddSubtask: (title: string) => void;
  onToggleSubtaskDone: (subId: string) => void;
}

function ReviewCard({ task, currentTarget, newSubtaskIds, jiraOpenUrl, onOpenJira, itsmConfig, onUpdate, onAddSubtask, onToggleSubtaskDone }: CardProps) {
  const [newSubTitle, setNewSubTitle] = useState('');
  const dimStyle = (target: Step['target']): React.CSSProperties => {
    if (!currentTarget) return {};
    const isFocused = currentTarget === target;
    return {
      opacity: isFocused ? 1 : 0.28,
      transition: 'opacity 0.25s, transform 0.25s, box-shadow 0.25s',
      transform: isFocused ? 'scale(1.02)' : 'scale(1)',
      boxShadow: isFocused ? '0 0 0 3px oklch(0.6 0.14 150 / 0.4), 0 4px 14px oklch(0.5 0.13 150 / 0.15)' : 'none',
      borderRadius: 10,
      padding: isFocused ? 8 : 0,
    };
  };

  const fl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 };
  const inp: React.CSSProperties = { width: '100%', fontSize: 14, padding: '9px 11px', borderRadius: 8, border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt)', boxSizing: 'border-box' };

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Title (always visible, undimmed) */}
      <div>
        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--t-txt)', letterSpacing: '-0.01em' }}>{task.title}</div>
        <div style={{ fontSize: 12, color: 'var(--t-muted)', marginTop: 4 }}>
          {task.status.replace('_', ' ')}{task.requester ? ` · ${task.requester}` : ''}{task.project ? ` · ${task.project}` : ''}
          {task.estimate ? ` · ${task.estimate}` : ''}
        </div>
      </div>

      {/* Jira — primary + every extra ticket on the task */}
      <div style={dimStyle('jira')}>
        <div style={fl}>Jira ticket{(task.extraJiraLinks ?? []).filter(l => l.trim()).length > 0 ? 's' : ''}</div>
        <div data-review-target="jira" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input value={task.jiraLink} onChange={e => onUpdate({ jiraLink: e.target.value })} placeholder="PROJ-1234" style={{ ...inp, flex: 1 }} />
            {task.jiraLink && jiraOpenUrl(task.jiraLink) && (
              <span onClick={() => onOpenJira(jiraOpenUrl(task.jiraLink)!, task.jiraLink)} style={{ fontSize: 18, color: 'var(--t-acc)', cursor: 'pointer' }} title={`Open ${task.jiraLink}`}>↗</span>
            )}
          </div>
          {(task.extraJiraLinks ?? []).map((link, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input value={link}
                onChange={e => { const n = [...(task.extraJiraLinks ?? [])]; n[i] = e.target.value; onUpdate({ extraJiraLinks: n }); }}
                placeholder="PROJ-1234" style={{ ...inp, flex: 1 }} />
              {link && jiraOpenUrl(link) && (
                <span onClick={() => onOpenJira(jiraOpenUrl(link)!, link)} style={{ fontSize: 18, color: 'var(--t-acc)', cursor: 'pointer' }} title={`Open ${link}`}>↗</span>
              )}
            </div>
          ))}
        </div>
        {!task.jiraLink && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--t-muted)', cursor: 'pointer', marginTop: 6 }}>
            <input type="checkbox" checked={!!task.noJira} onChange={e => onUpdate({ noJira: e.target.checked })} style={{ cursor: 'pointer' }} />
            No Jira needed
          </label>
        )}
      </div>

      {/* Subtasks */}
      <div style={dimStyle('subtasks')}>
        <div style={fl}>Subtasks {task.subtasks.length > 0 && `(${task.subtasks.filter(s => s.done).length}/${task.subtasks.length})`}</div>
        <div data-review-target="subtasks" style={{ display: 'flex', flexDirection: 'column', gap: 6, minHeight: 40 }}>
          {task.subtasks.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--t-muted)', padding: '10px 12px', border: '1px dashed var(--t-brd)', borderRadius: 8 }}>
              No subtasks yet — break this task down.
            </div>
          )}
          {task.subtasks.map(sub => {
            const isNew = newSubtaskIds.has(sub.id);
            return (
              <div key={sub.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '7px 11px', border: '1px solid var(--t-brd)', borderRadius: 8,
                background: isNew ? 'oklch(0.94 0.09 150)' : 'var(--t-surf)',
              }}>
                <input type="checkbox" checked={sub.done} onChange={() => onToggleSubtaskDone(sub.id)} style={{ width: 15, height: 15, cursor: 'pointer', flexShrink: 0 }} />
                <span style={{ fontSize: 14, textDecoration: sub.done ? 'line-through' : 'none', color: sub.done ? 'var(--t-muted)' : 'var(--t-txt)' }}>{sub.title}</span>
                {isNew && <span style={{ fontSize: 10, fontWeight: 700, color: 'oklch(0.4 0.14 150)', textTransform: 'uppercase', letterSpacing: '0.05em', marginLeft: 'auto' }}>New</span>}
              </div>
            );
          })}
          <input
            value={newSubTitle}
            onChange={e => setNewSubTitle(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && newSubTitle.trim()) {
                e.stopPropagation();
                onAddSubtask(newSubTitle.trim());
                setNewSubTitle('');
              }
            }}
            placeholder="+ Add subtask (Enter to add)"
            style={{ ...inp, marginTop: 4 }}
          />
        </div>
      </div>

      {/* Estimates (expanded so user can fill during review) */}
      <div style={dimStyle('estimate')}>
        <EstimatesSection task={task} startOpen />
      </div>

      {/* ITSM (only if present) */}
      {task.itsmTicket !== undefined && (
        <div style={dimStyle('itsm')}>
          <div style={fl}>ServiceNow ticket</div>
          <div data-review-target="itsm" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input value={task.itsmTicket ?? ''} onChange={e => onUpdate({ itsmTicket: e.target.value })} placeholder="INC0001234" style={{ ...inp, flex: 1 }} />
            {task.itsmTicket && itsmTicketUrl(itsmConfig, task.itsmTicket) && (
              <a href={itsmTicketUrl(itsmConfig, task.itsmTicket)!} target="_blank" rel="noreferrer" style={{ fontSize: 18, color: 'var(--t-acc)', textDecoration: 'none' }}>↗</a>
            )}
          </div>
        </div>
      )}

      {/* Communication (enlarged) */}
      <div style={dimStyle('communication')}>
        <CommunicationSection taskId={task.id} task={task} fields={getCommunications(task.communications)} emphasized />
      </div>

      {/* Notes (dim always if not focused) */}
      {task.notes && (
        <div style={{ opacity: 0.6 }}>
          <div style={fl}>Notes</div>
          <div style={{ fontSize: 13, color: 'var(--t-txt2)', whiteSpace: 'pre-wrap', padding: '10px 12px', background: 'var(--t-surf)', border: '1px solid var(--t-brd)', borderRadius: 8, maxHeight: 120, overflow: 'auto' }}>
            {task.notes}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────

const backdropSt: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
  zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 24,
};

const popupSt: React.CSSProperties = {
  width: 'min(1080px, 100%)', height: 'min(720px, 100%)',
  background: 'var(--t-surf)', borderRadius: 14,
  boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
  display: 'flex', flexDirection: 'column', overflow: 'hidden',
};
