import type { CustomSystem } from './types';
import { logOpenUrl } from './apiLog';

const withScheme = (u: string) => /^https?:\/\//i.test(u) ? u : `https://${u}`;

/** baseUrl + openUri + ticket id — null when unconfigured/empty. */
export function customOpenUrl(sys: CustomSystem, ticket: string): string | null {
  if (!sys.baseUrl.trim() || !ticket.trim()) return null;
  return withScheme(sys.baseUrl.trim()) + (sys.openUri ?? '') + encodeURIComponent(ticket.trim());
}

/** baseUrl + createUri — null when the system has no create URI. */
export function customCreateUrl(sys: CustomSystem): string | null {
  if (!sys.baseUrl.trim() || !sys.createUri?.trim()) return null;
  return withScheme(sys.baseUrl.trim()) + sys.createUri.trim();
}

export function openCustomUrl(tag: string, url: string): void {
  logOpenUrl(tag, url);
  window.open(url, '_blank');
}

/** Template create URL: baseUrl + createUri (the COMMON start of creation)
 *  + the template's own uri, prompting for each FILL placeholder. Returns
 *  null if the user cancels a prompt. */
export function customTemplateUrl(sys: CustomSystem, tpl: { name: string; uri: string }): string | null {
  if (!sys.baseUrl.trim()) return null;
  let uri = (sys.createUri ?? '').trim() + tpl.uri.trim();
  while (uri.includes('FILL')) {
    const v = window.prompt(`${sys.name} · ${tpl.name} — value for FILL:`);
    if (v === null) return null;
    uri = uri.replace('FILL', encodeURIComponent(v));
  }
  return withScheme(sys.baseUrl.trim()) + uri;
}
