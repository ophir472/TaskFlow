import type { AiConfig, Task } from './types';
import { log } from './snapshots';

export const DEFAULT_AI_PROMPT = `You are helping with a task from my task manager.

Task: <TITLE>
Description: <DESCRIPTION>
Notes: <NOTES>
Blockers: <BLOCKERS>
Subtasks:
<SUBTASKS>

Suggest the concrete next steps, flag anything that seems missing, and keep it short.`;

export const EMPTY_AI_CONFIG: AiConfig = {
  endpointUrl: '',
  format: 'openai',
  model: '',
  apiKey: '',
  extraHeaders: '',
  promptTemplate: DEFAULT_AI_PROMPT,
};

export function fillPromptTemplate(tpl: string, task: Task): string {
  const subs = task.subtasks.map(s => `- [${s.done ? 'x' : ' '}] ${s.title}${s.isNext ? ' (next)' : ''}`).join('\n') || '(none)';
  const map: Record<string, string> = {
    TITLE: task.title,
    DESCRIPTION: task.description || '(none)',
    NOTES: task.notes || '(none)',
    BLOCKERS: task.blockers || '(none)',
    JIRA: task.jiraLink || '(none)',
    ITSM: task.itsmTicket || '(none)',
    LINK: task.generalLink || '(none)',
    REQUESTER: task.requester || '(none)',
    PROJECT: task.project || '(none)',
    SUBTASKS: subs,
  };
  return tpl.replace(/<([A-Z]+)>/g, (m, key) => (key in map ? map[key] : m));
}

/**
 * POST the prompt to the configured endpoint and return the model's text.
 * The full response goes to the forensic log ONLY — by design nothing is
 * persisted in app state.
 */
export async function callAi(cfg: AiConfig, prompt: string, taskId: string, taskTitle: string): Promise<string> {
  let extra: Record<string, string> = {};
  if (cfg.extraHeaders.trim()) {
    try { extra = JSON.parse(cfg.extraHeaders); } catch { throw new Error('Extra headers is not valid JSON'); }
  }
  const isAnthropic = cfg.format === 'anthropic';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(isAnthropic
      ? { 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }
      : { Authorization: `Bearer ${cfg.apiKey}` }),
    ...extra,
  };
  const body = isAnthropic
    ? { model: cfg.model, max_tokens: 4096, messages: [{ role: 'user', content: prompt }] }
    : { model: cfg.model, messages: [{ role: 'user', content: prompt }] };

  log('ai:request', { taskId, taskTitle, model: cfg.model, format: cfg.format, prompt });
  let res: Response;
  try {
    res = await fetch(cfg.endpointUrl.trim(), { method: 'POST', headers, body: JSON.stringify(body) });
  } catch (err) {
    log('ai:error', { taskId, error: err instanceof Error ? err.message : String(err) });
    throw err;
  }
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const e = await res.json();
      msg = e.error?.message ?? e.message ?? msg;
    } catch { /* ignore */ }
    log('ai:error', { taskId, status: res.status, error: msg });
    throw new Error(msg);
  }
  const data = await res.json();
  let text = '';
  if (isAnthropic) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    text = Array.isArray(data.content) ? data.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n') : '';
  } else {
    text = data.choices?.[0]?.message?.content ?? '';
  }
  if (!text) throw new Error('Empty response from model');
  log('ai:response', { taskId, taskTitle, model: cfg.model, response: text });
  return text;
}
