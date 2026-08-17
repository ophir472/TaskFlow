import { log } from './snapshots';

const REDACT = new Set(['authorization', 'x-api-key']);

function redactHeaders(h: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h)) out[k] = REDACT.has(k.toLowerCase()) ? '«redacted»' : v;
  return out;
}

function safeParse(t: string): unknown {
  try { return JSON.parse(t); } catch { return t.length > 4000 ? t.slice(0, 4000) + '…' : t; }
}

/**
 * Debug-instrumented fetch for the Jira / ServiceNow integrations. The full
 * request and response (credentials redacted) are written to BOTH the browser
 * console (collapsed group per call) and the forensic log file — the Network
 * tab shows the raw traffic, this makes it greppable and reload-proof.
 * Consumes the response body; callers get it back as text.
 */
export async function loggedFetch(
  tag: string,
  url: string,
  init: RequestInit & { headers: Record<string, string> },
): Promise<{ res: Response; text: string }> {
  const started = Date.now();
  const reqInfo = {
    method: init.method ?? 'GET',
    url,
    headers: redactHeaders(init.headers),
    body: typeof init.body === 'string' ? safeParse(init.body) : undefined,
  };
  console.groupCollapsed(`[${tag}] ${reqInfo.method} ${url}`);
  console.log('request', reqInfo);
  log(`${tag}:request`, reqInfo);

  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('network error (CORS? host unreachable?)', msg);
    console.groupEnd();
    log(`${tag}:network-error`, { url, error: msg, ms: Date.now() - started });
    throw err;
  }

  const text = await res.text();
  const respInfo = { status: res.status, statusText: res.statusText, ms: Date.now() - started, body: safeParse(text) };
  if (res.ok) console.log('response', respInfo);
  else console.warn('response (error)', respInfo);
  console.groupEnd();
  log(`${tag}:response`, { url, ...respInfo });
  return { res, text };
}

/** Log a URL the app is about to open in a new tab (URL-create flows). */
export function logOpenUrl(tag: string, url: string, extra?: Record<string, unknown>): void {
  console.log(`[${tag}] opening`, url, extra ?? '');
  log(`${tag}:open-url`, { url, ...extra });
}
