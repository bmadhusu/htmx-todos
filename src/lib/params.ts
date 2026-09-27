import { parseFilter, TITLE_MAX, type Filter } from '../store/types.ts';

export type ListParams = { filter: Filter; q: string; edit: string | null };

export function parseListParams(source: unknown): ListParams {
  const record = (source ?? {}) as Record<string, unknown>;
  return {
    filter: parseFilter(record.filter),
    q: typeof record.q === 'string' ? record.q.slice(0, TITLE_MAX) : '',
    edit: typeof record.edit === 'string' && record.edit !== '' ? record.edit : null,
  };
}

/**
 * Rebuilt from the request's own query and body, never from the Referer header:
 * Referer is stripped often enough that the no-JS path would silently lose the
 * visitor's filter.
 */
export function backUrl(
  req: { query: unknown; body?: unknown },
  extra: Record<string, string> = {},
): string {
  const merged = {
    ...((req.query as Record<string, unknown>) ?? {}),
    ...((req.body as Record<string, unknown>) ?? {}),
  };
  const { filter, q } = parseListParams(merged);

  const params = new URLSearchParams({ filter });
  if (q) params.set('q', q);
  for (const [key, value] of Object.entries(extra)) params.set(key, value);
  return `/?${params.toString()}`;
}
