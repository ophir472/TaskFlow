import { nextId } from './engine';
import type { GetBackTo } from './types';

// The ONE place a "get back to" note is constructed — used by the create
// form, Spotlight/Explore quick-create, and the Hub's inline add. Title is
// always derived from `who`; keep it that way (store.updateItem re-derives
// it if `who` is edited later).
export function buildGetBackTo(who: string, notes = ''): GetBackTo {
  const now = Date.now();
  return {
    id: nextId('g'), kind: 'getback',
    title: `Get back to ${who.trim()}`,
    who: who.trim(), notes,
    done: false,
    bumpedAt: now, createdAt: now, updatedAt: now, archived: false,
  };
}
