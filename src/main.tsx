import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { getSnapshotDir } from './snapshots'

// If URL is #preview/<snapshot-filename>, load that snapshot into sessionStorage
// BEFORE React mounts, so Zustand hydrates from it. sessionStorage is per-tab,
// so preview edits never affect the real localStorage / other tabs.
async function bootPreview(): Promise<void> {
  const match = window.location.hash.match(/^#preview\/(.+?)(?:\/|$)/);
  if (!match) return;
  const filename = decodeURIComponent(match[1]);
  const dir = await getSnapshotDir();
  if (!dir) throw new Error('No snapshot folder configured — cannot preview.');
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fh = await (dir as any).getFileHandle(filename);
    const text = await (await fh.getFile()).text();
    const parsed = JSON.parse(text);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { savedAt, ...state } = parsed;
    // Seed sessionStorage so Zustand persist rehydrates from it
    sessionStorage.setItem('taskflow-store', JSON.stringify(state));
    // Expose metadata for the preview banner in App.tsx
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__preview = { filename, savedAt };
  } catch (err) {
    document.body.innerHTML = `<div style="padding:40px;font-family:system-ui">
      <h2>Preview failed</h2>
      <p>Could not load snapshot: <code>${filename}</code></p>
      <p style="color:#c00">${err instanceof Error ? err.message : String(err)}</p>
      <p><a href="/">← Back to app</a></p>
    </div>`;
    throw err;
  }
}

async function main() {
  try {
    await bootPreview();
  } catch {
    return; // don't mount app if preview bootstrapping failed
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

main();
