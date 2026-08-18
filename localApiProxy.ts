import http from 'node:http';
import https from 'node:https';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

/**
 * TaskFlow local API proxy — server-side only, nothing from src/ imports this.
 *
 * Browser fetches to Jira / ServiceNow / AI endpoints die on CORS (corporate
 * hosts don't allow the localhost origin). But TaskFlow always runs from the
 * local Vite server (start.sh, dev or --build preview), and a server-side
 * request has no CORS at all. So the app sends API calls to the same-origin
 * path
 *
 *     /api-proxy/<scheme>/<host[:port]>/<original path+query>
 *
 * and this middleware forwards them from Node to the real host. The target is
 * taken from the path — hosts stay data (Settings), nothing is hardcoded here.
 *
 * Contract with the client (src/apiLog.ts proxiedFetch):
 *  - every response we produce carries `x-taskflow-proxy: 1`, so the app can
 *    tell "answer came through the proxy" from "no proxy here" (e.g. a
 *    statically hosted build, where the same path 404s without the marker —
 *    the app then falls back to a direct fetch);
 *  - when the proxy itself could not reach the target, we answer 502 with
 *    `x-taskflow-proxy-error`, which the app treats like a network failure.
 *
 * Auth headers pass through untouched and are never logged or stored here.
 * TLS: corporate Jira/ServiceNow often use internal/self-signed certificates,
 * so target certificates are NOT verified (rejectUnauthorized: false). That is
 * acceptable only because this proxy binds to your own machine's dev server.
 */

export const API_PROXY_PREFIX = '/api-proxy';

// After connect strips the mount prefix: /<scheme>/<host[:port]>/<rest>
const ROUTE = /^\/(https?)\/([A-Za-z0-9.-]+(?::\d+)?)(\/.*|$)/;

function proxyError(res: ServerResponse, status: number, message: string): void {
  if (res.headersSent) { res.end(); return; }
  res.statusCode = status;
  res.setHeader('x-taskflow-proxy', '1');
  res.setHeader('x-taskflow-proxy-error', message.replace(/[^\x20-\x7e]/g, '?').slice(0, 300));
  res.end(message);
}

function forward(req: IncomingMessage, res: ServerResponse): void {
  const m = ROUTE.exec(req.url ?? '');
  if (!m) {
    proxyError(res, 400, 'Bad proxy path — expected /api-proxy/<scheme>/<host>/<path>');
    return;
  }
  const [, scheme, hostPort, rest] = m;
  const [host, port] = hostPort.split(':');

  // Strip same-origin artifacts; the target must see itself as the host.
  const headers: Record<string, string | string[] | undefined> = { ...req.headers };
  delete headers.host;
  delete headers.origin;
  delete headers.referer;
  delete headers.cookie;
  delete headers.connection;

  const options: https.RequestOptions = {
    host,
    port: port ? Number(port) : scheme === 'https' ? 443 : 80,
    path: rest || '/',
    method: req.method,
    headers: { ...headers, host: hostPort },
    rejectUnauthorized: false, // internal/self-signed corporate certs
  };
  const preq = (scheme === 'https' ? https : http).request(options, pres => {
    res.writeHead(pres.statusCode ?? 502, { ...pres.headers, 'x-taskflow-proxy': '1' });
    pres.pipe(res);
  });
  // Connection failures can be AggregateErrors with an empty .message — fall
  // back to the errno code so the forensic log always says why.
  preq.on('error', err => proxyError(res, 502, `Proxy could not reach ${hostPort}: ${err.message || (err as NodeJS.ErrnoException).code || 'network error'}`));
  req.pipe(preq);
}

export function apiProxyPlugin(): Plugin {
  return {
    name: 'taskflow-api-proxy',
    configureServer(server) {
      server.middlewares.use(API_PROXY_PREFIX, forward);
    },
    configurePreviewServer(server) {
      server.middlewares.use(API_PROXY_PREFIX, forward);
    },
  };
}
