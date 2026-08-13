/**
 * Backdrop-dismiss props that only fire when the interaction STARTED on the
 * backdrop. When a text-selection drag begins inside the panel and the mouse
 * is released outside it, the browser dispatches the click on the backdrop
 * (their common ancestor) — plain onClick={onClose} would dismiss the popup
 * mid-selection. The mousedown origin is remembered on the element itself,
 * so this needs no hook and can be spread inline.
 */
export function backdropCloseProps(onClose: () => void) {
  return {
    onMouseDown: (e: React.MouseEvent) => {
      (e.currentTarget as HTMLElement).dataset.mdOnBackdrop = e.target === e.currentTarget ? '1' : '';
    },
    onClick: (e: React.MouseEvent) => {
      const el = e.currentTarget as HTMLElement;
      const fire = el.dataset.mdOnBackdrop === '1' && e.target === e.currentTarget;
      el.dataset.mdOnBackdrop = '';
      if (fire) onClose();
    },
  };
}
