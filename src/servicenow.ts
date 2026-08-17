import type { SnConfig, SnTemplate, SnTicketType } from './types';
import { logOpenUrl } from './apiLog';

export const EMPTY_SN_CONFIG: SnConfig = {
  incUrlTemplate: '',
  chgUrlTemplate: '',
  fieldSeparator: '^',
  fields: [],
  templates: [],
  defaultFieldValues: { INC: {}, CHG: {} },
};

export interface SnResolvedField {
  key: string;
  label: string;
  value: string;
  needsFill: boolean;
}

/**
 * Template values merged over the type's default ticket (an empty template
 * value inherits the default). Only fields with a non-empty result are
 * returned, in the order they're configured in Settings.
 */
export function resolveSnFields(cfg: SnConfig, tpl: SnTemplate): SnResolvedField[] {
  const defaults = cfg.defaultFieldValues[tpl.type] ?? {};
  return cfg.fields
    .filter(f => f.key.trim())
    .map(f => {
      const own = (tpl.fieldValues[f.id] ?? '').trim();
      const value = own || (defaults[f.id] ?? '').trim();
      return { key: f.key.trim(), label: f.label.trim() || f.key.trim(), value, needsFill: value.includes('FILL') };
    })
    .filter(f => f.value);
}

/**
 * Build the pre-filled ServiceNow URL for a ticket type. Individual
 * {<field key>} tokens are substituted first (value URL-encoded); the
 * remaining fields serialize to key=value pairs joined by the configured
 * separator, placed at {fields} or appended as query params.
 * Null when the type has no URL configured.
 */
export function buildSnUrl(cfg: SnConfig, type: SnTicketType, fields: { key: string; value: string }[]): string | null {
  let u = (type === 'INC' ? cfg.incUrlTemplate : cfg.chgUrlTemplate).trim();
  if (!u) return null;
  const remaining: { key: string; value: string }[] = [];
  for (const f of fields) {
    const token = `{${f.key}}`;
    if (u.includes(token)) u = u.split(token).join(encodeURIComponent(f.value));
    else remaining.push(f);
  }
  const serialized = remaining.map(f => `${f.key}=${encodeURIComponent(f.value)}`).join(cfg.fieldSeparator || '^');
  if (u.includes('{fields}')) u = u.split('{fields}').join(serialized);
  else if (serialized) u += (u.includes('?') ? '&' : '?') + serialized;
  const final = /^https?:\/\//i.test(u) ? u : `https://${u}`;
  logOpenUrl('sn:create-url', final, { type, fields: fields.map(f => ({ key: f.key, value: f.value })) });
  return final;
}
