// Chain-in-circle "link" glyph (the flaticon 10016986 shape, redrawn inline so
// it needs no network and follows the button's text colour).
export const LinkIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="10.5" />
    <path d="M10.4 13.6a2.6 2.6 0 0 1 0-3.7l2.4-2.4a2.6 2.6 0 0 1 3.7 3.7l-1.3 1.3" />
    <path d="M13.6 10.4a2.6 2.6 0 0 1 0 3.7l-2.4 2.4a2.6 2.6 0 0 1-3.7-3.7l1.3-1.3" />
  </svg>
);
