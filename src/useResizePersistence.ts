import { useEffect, useLayoutEffect, useRef } from 'react';
import { useStore } from './store';
import type { Task } from './types';

// Watches an element for user-initiated resize and persists the height into
// task.fieldSizes[fieldKey]. Applies the saved height on mount and whenever
// the taskId/fieldKey pair changes (so navigating between cards swaps in each
// card's own remembered sizes).
export function useResizePersistence(
  ref: React.RefObject<HTMLElement | null>,
  taskId: string,
  fieldKey: string,
) {
  const items = useStore(s => s.items);
  const setFieldSize = useStore(s => s.setFieldSize);
  const task = items.find(it => it.id === taskId && it.kind === 'task') as Task | undefined;
  const storedHeight = task?.fieldSizes?.[fieldKey];
  // Height we last applied ourselves — so the observer callback we trigger
  // by applying the style doesn't loop back into a save.
  const lastAppliedRef = useRef<number | null>(null);
  // Skip the ResizeObserver's initial synchronous callback — that fire is
  // just "here's the current size" not a user resize.
  const initialObservationRef = useRef<boolean>(true);

  // Apply the stored height synchronously before paint. When switching cards
  // and the new card has no stored size, reset back to the default (unset
  // style) so the textarea's rows attribute takes over.
  useLayoutEffect(() => {
    if (!ref.current) return;
    if (storedHeight) {
      ref.current.style.height = `${storedHeight}px`;
      lastAppliedRef.current = storedHeight;
    } else {
      ref.current.style.height = '';
      lastAppliedRef.current = null;
    }
    // Card just changed — treat the next observer fire as the "initial" one.
    initialObservationRef.current = true;
  }, [ref, storedHeight, taskId, fieldKey]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const obs = new ResizeObserver(() => {
      // Use offsetHeight (border-box) so it matches the value we set via
      // style.height. clientHeight excludes borders, which caused the
      // "field shrinks a bit each save" feedback loop.
      const h = el.offsetHeight;
      if (initialObservationRef.current) {
        initialObservationRef.current = false;
        return;
      }
      if (lastAppliedRef.current !== null && Math.abs(h - lastAppliedRef.current) < 2) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        lastAppliedRef.current = h;
        setFieldSize(taskId, fieldKey, h);
      }, 400);
    });
    obs.observe(el);
    return () => {
      obs.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [ref, taskId, fieldKey, setFieldSize]);
}
