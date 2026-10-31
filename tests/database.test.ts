import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { emptyWorkspace } from '../src/domain';

const db = new PGlite();
const alice = '00000000-0000-0000-0000-000000000001', bob = '00000000-0000-0000-0000-000000000002';
beforeAll(async () => {
  await db.exec(`create schema auth; create role anon; create role authenticated; create table auth.users(id uuid primary key); insert into auth.users values ('${alice}'),('${bob}'); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$; grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
  await db.exec(await readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8'));
  await db.exec('set role authenticated');
});
afterAll(async () => { await db.close(); });
it('saves atomically, rejects stale revisions, and isolates account data', async () => {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[alice]);
  const first = await db.query<{ revision:number }>('select * from public.save_invoice_workspace($1,$2::jsonb)',[0,JSON.stringify(emptyWorkspace())]);
  expect(Number(first.rows[0].revision)).toBe(1);
  await expect(db.query('select * from public.save_invoice_workspace($1,$2::jsonb)',[0,JSON.stringify(emptyWorkspace())])).rejects.toMatchObject({ code:'40001' });
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[bob]);
  expect((await db.query('select * from public.invoice_workspaces')).rows).toHaveLength(0);
  await expect(db.query('insert into public.invoice_workspaces(owner_id,data) values($1,$2::jsonb)',[alice,JSON.stringify(emptyWorkspace())])).rejects.toMatchObject({ code:'42501' });
  await db.query('select * from public.save_invoice_workspace($1,$2::jsonb)',[0,JSON.stringify(emptyWorkspace())]);
  const rows = await db.query<{ owner_id:string }>('select * from public.invoice_workspaces');
  expect(rows.rows).toHaveLength(1); expect(rows.rows[0].owner_id).toBe(bob);
  await db.exec('reset role; set role anon');
  await expect(db.query('select * from public.invoice_workspaces')).rejects.toMatchObject({ code:'42501' });
  await expect(db.query('select * from public.save_invoice_workspace($1,$2::jsonb)',[0,JSON.stringify(emptyWorkspace())])).rejects.toMatchObject({ code:'42501' });
});
