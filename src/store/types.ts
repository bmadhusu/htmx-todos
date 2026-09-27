export type Filter = 'all' | 'active' | 'done';

export type Todo = {
  id: string;
  title: string;
  done: boolean;
  createdAt: string;
};

export type Trash = {
  todo: Todo;
  index: number;
  expiresAt: string;
};

export type Session = {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  todos: Todo[];
  trash?: Trash;
};

export interface TodoStore {
  list(sid: string, filter: Filter, query?: string): Todo[];
  create(sid: string, title: string): Todo;
  get(sid: string, id: string): Todo;
  rename(sid: string, id: string, title: string): Todo;
  setDone(sid: string, id: string, done: boolean): Todo;
  remove(sid: string, id: string): Todo;
  restore(sid: string, id: string): Todo;
  remaining(sid: string): number;
  has(sid: string): boolean;
  touch(sid: string): void;
  sweep(now: Date): void;
}

/**
 * Persistence needs to read and replace the whole store, which no route handler
 * should be able to do — hence a separate interface rather than widening TodoStore.
 */
export interface SerializableStore extends TodoStore {
  toJSON(): Session[];
  fromJSON(sessions: Session[]): void;
}

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const UNDO_TTL_MS = 30 * 1000;
export const TITLE_MAX = 200;

export function parseFilter(value: unknown): Filter {
  return value === 'active' || value === 'done' ? value : 'all';
}
