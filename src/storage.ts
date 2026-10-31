import { createClient } from '@supabase/supabase-js';
import { emptyWorkspace, parseWorkspace } from './domain';
import type { Workspace } from './domain';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const cloud = url && key ? createClient(url, key, { auth: { storageKey: 'folio-auth', detectSessionInUrl: true } }) : null;
const LOCAL_KEY = 'folio-workspace-v1';
export type Snapshot = { revision: number; data: Workspace };
export class ConflictError extends Error {
  constructor() { super('This workspace changed on another device or tab. The latest data has been loaded. Review it and save again.'); }
}
export async function loadWorkspace(): Promise<Snapshot> {
  if (!cloud) {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return { revision: 0, data: emptyWorkspace() };
    const result = JSON.parse(raw) as Snapshot;
    if (!Number.isSafeInteger(result.revision) || result.revision < 0) throw new Error('Local data could not be read. Restore a backup from Settings.');
    return { revision: result.revision, data: parseWorkspace(result.data) };
  }
  const { data, error } = await cloud.from('invoice_workspaces').select('revision, data').single();
  if (error?.code === 'PGRST116') return { revision: 0, data: emptyWorkspace() };
  if (error) throw new Error(`Could not load your workspace: ${error.message}`);
  return { revision: data.revision, data: parseWorkspace(data.data) };
}
export async function saveWorkspace(data: Workspace, expectedRevision: number): Promise<Snapshot> {
  parseWorkspace(data);
  if (!cloud) {
    const save = async () => {
      const current = await loadWorkspace();
      if (current.revision !== expectedRevision) throw new ConflictError();
      const next = { revision: expectedRevision + 1, data };
      localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
      return next;
    };
    return navigator.locks ? navigator.locks.request('folio-workspace-save', save) : save();
  }
  const { data: result, error } = await cloud.rpc('save_invoice_workspace', { expected_revision: expectedRevision, new_data: data });
  if (error?.code === '40001') throw new ConflictError();
  if (error) throw new Error(`Your changes were not saved: ${error.message}`);
  return { revision: result[0].revision, data: parseWorkspace(result[0].data) };
}
export function downloadFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
