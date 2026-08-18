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

/** Thrown when a request failed at network level BOTH via the local proxy and
 *  directly (CORS/offline) — i.e. the API is unreachable, not rejecting. */
export class ApiUnreachableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiUnreachableError';
  }
}

const PROXY_PREFIX = '/api-proxy';

function proxyPath(url: string): string | null {
  const m = /^(https?):\/\/([A-Za-z0-9.-]+(?::\d+)?)(\/.*)?$/i.exec(url);
  return m ? `${PROXY_PREFIX}/${m[1].toLowerCase()}/${m[2]}${m[3] ?? '/'}` : null;
}

/**
 * fetch routed through the local server's /api-proxy (localApiProxy.ts):
 * same-origin, so browser CORS never applies — the Vite server forwards the
 * request from Node. Falls back to a direct fetch when there is no proxy
 * (missing x-taskflow-proxy marker, e.g. a statically hosted build) or the
 * proxy couldn't reach the target. Throws ApiUnreachableError only when both
 * paths fail at network level.
 */
export async function proxiedFetch(url: string, init: RequestInit): Promise<{ res: Response; via: 'proxy' | 'direct' }> {
  const pp = proxyPath(url);
  let proxyFailure: string | null = null;
  if (pp) {
    try {
      const res = await fetch(pp, init);
      const viaProxy = res.headers.get('x-taskflow-proxy') === '1';
      const perr = res.headers.get('x-taskflow-proxy-error');
      if (viaProxy && !perr) return { res, via: 'proxy' };
      proxyFailure = perr ?? 'no local proxy (marker header missing)';
    } catch (e) {
      proxyFailure = e instanceof Error ? e.message : String(e);
    }
  }
  try {
    const res = await fetch(url, init);
    return { res, via: 'direct' };
  } catch (e) {
    const direct = e instanceof Error ? e.message : String(e);
    throw new ApiUnreachableError(`API unreachable — local proxy: ${proxyFailure ?? 'not applicable'}; direct: ${direct} (CORS or network)`);
  }
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
  let via: 'proxy' | 'direct';
  try {
    ({ res, via } = await proxiedFetch(url, init));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('network error (no local proxy + CORS/host unreachable?)', msg);
    console.groupEnd();
    log(`${tag}:network-error`, { url, error: msg, ms: Date.now() - started });
    throw err;
  }

  const text = await res.text();
  const resHeaders: Record<string, string> = {};
  res.headers.forEach((v, k) => { resHeaders[k] = k.toLowerCase() === 'set-cookie' ? '«redacted»' : v; });
  const respInfo = { status: res.status, statusText: res.statusText, via, ms: Date.now() - started, headers: resHeaders, body: safeParse(text) };
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
