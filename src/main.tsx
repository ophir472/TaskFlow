import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { getSnapshotDir } from './snapshots'
import { useStore } from './store'

// If URL is #preview/<snapshot-filename>, load that snapshot into sessionStorage
// BEFORE React mounts AND before Zustand rehydrates. sessionStorage is per-tab,
// so preview edits never affect the real localStorage / other tabs.
async function bootPreview(): Promise<void> {
  const match = window.location.hash.match(/^#preview\/(.+?)(?:\/|$)/);
  if (!match) return;
  const filename = decodeURIComponent(match[1]);
  const dir = await getSnapshotDir();
  if (!dir) throw new Error('No snapshot folder configured — cannot preview.');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fh = await (dir as any).getFileHandle(filename);
  const text = await (await fh.getFile()).text();
  const parsed = JSON.parse(text);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { savedAt, ...state } = parsed;
  // Seed sessionStorage BEFORE we trigger Zustand rehydration
  sessionStorage.setItem('taskflow-store', JSON.stringify(state));
  // Expose metadata for the preview banner in App.tsx
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).__preview = { filename, savedAt };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).__previewMode = true;
  // Store has skipHydration:true in preview mode — hydrate manually now
  // that sessionStorage is populated.
  await useStore.persist.rehydrate();
}

async function main() {
  try {
    await bootPreview();
  } catch (err) {
    const filename = window.location.hash.replace(/^#preview\//, '');
    document.body.innerHTML = `<div style="padding:40px;font-family:system-ui;max-width:600px;margin:40px auto">
      <h2>Preview failed</h2>
      <p>Could not load snapshot: <code>${filename}</code></p>
      <p style="color:#c00">${err instanceof Error ? err.message : String(err)}</p>
      <p><button onclick="window.close()">Close</button></p>
    </div>`;
    return;
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

main();
