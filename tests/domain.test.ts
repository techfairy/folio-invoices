import { describe, expect, it } from 'vitest';
import { decimal, emptyWorkspace, numberFor, parseWorkspace, totals, validatePattern } from '../src/domain';
import type { Invoice } from '../src/domain';

describe('invoice arithmetic', () => {
  it('rounds each line to cents before calculating tax', () => {
    const result = totals([{ id:'a',description:'Service',quantity:'1.5',rate:'99.99' },{ id:'b',description:'Service',quantity:'2',rate:'0.10' }],'20');
    expect(result).toEqual({ lines:[14999,20],subtotal:15019,taxAmount:3004,total:18023 });
  });
  it('accepts decimal commas and fractional quantities', () => {
    expect(totals([{ id:'a',description:'Service',quantity:'0,125',rate:'10,00' }],'0').total).toBe(125);
  });
  it.each(['-1','1e3','NaN','Infinity','1.001','', '10 USD'])('rejects invalid monetary input %s', value => expect(() => decimal(value)).toThrow());
  it('does not accept tax over 100%', () => expect(() => totals([],'100.01')).toThrow());
});
describe('numbering', () => {
  it('renders the requested format', () => expect(numberFor({ pattern:'IVR-{SEQ:2}_{MM}/{YYYY}',next:4,reset:'never',period:'' },'2026-10-04',[]).number).toBe('IVR-04_10/2026'));
  it('resets in a new month and skips previously issued numbers', () => {
    const old = [{ number:'IVR-01_10/2026' }] as Invoice[];
    const result = numberFor({ pattern:'IVR-{SEQ:2}_{MM}/{YYYY}',next:19,reset:'month',period:'2026-09' },'2026-10-04',old);
    expect(result.number).toBe('IVR-02_10/2026'); expect(result.numbering.next).toBe(3);
  });
  it('skips collisions even when a reset pattern does not include a date', () => expect(numberFor({ pattern:'INV-{SEQ}',next:12,reset:'year',period:'2025' },'2026-10-04',[{ number:'INV-1' },{ number:'INV-2' }] as Invoice[]).number).toBe('INV-3'));
  it.each(['INV-{MM}', 'INV-{SEQ:9}', 'INV-{SEQ}-{UNKNOWN}', 'INV-{SEQ'])('rejects broken pattern %s', p => expect(() => validatePattern(p)).toThrow());
  it('does not reset in the same period', () => expect(numberFor({ pattern:'{SEQ:3}/{YY}',next:18,reset:'year',period:'2026' },'2026-05-01',[]).number).toBe('018/26'));
  it('rejects impossible dates', () => expect(() => numberFor(emptyWorkspace().settings.numbering,'2026-02-30',[])).toThrow());
});
describe('backup validation', () => {
  it('accepts an empty workspace', () => expect(parseWorkspace(emptyWorkspace())).toEqual(emptyWorkspace()));
  it('rejects malformed backups rather than silently erasing records', () => expect(() => parseWorkspace({ schema:1,clients:[],invoices:[{}] })).toThrow());
  it('rejects repeated clients', () => {
    const client = { id:'same',name:'Example',email:'',address:'',taxId:'',createdAt:'2026-10-01',archived:false };
    expect(() => parseWorkspace({ ...emptyWorkspace(),clients:[client,client] })).toThrow();
  });
  it('reads saved invoices independently of the current device timezone and date', () => {
    const workspace = emptyWorkspace();
    workspace.invoices = [{ id:'future-relative',clientId:'sample',number:'INV-1',date:'2099-01-01',paidDate:'2099-01-01',currency:'EUR',sender:{ name:'Studio',email:'',address:'',taxId:'' },client:{ name:'Client',email:'',address:'',taxId:'' },items:[{ id:'a',description:'Work',quantity:'1',rate:'1' }],tax:'0',note:'',createdAt:'2099-01-01T00:00:00Z' }];
    expect(parseWorkspace(workspace).invoices).toHaveLength(1);
  });
  it('migrates legacy clients to separate counters without sharing references', () => {
    const workspace=emptyWorkspace();
    const oldClient={ name:'Client',email:'',address:'',taxId:'',createdAt:'2026-10-01',archived:false };
    const migrated=parseWorkspace({ ...workspace,clients:[{ ...oldClient,id:'a' },{ ...oldClient,id:'b' }] });
    expect(migrated.clients[0].numbering.pattern).toBe(workspace.settings.numbering.pattern);
    migrated.clients[0].numbering.next=99;
    expect(migrated.clients[1].numbering.next).toBe(1);
    expect(workspace.settings.numbering.next).toBe(1);
  });
  it('rejects invalid client numbering in imported backups', () => {
    const client={ id:'a',name:'Client',email:'',address:'',taxId:'',createdAt:'2026-10-01',archived:false,numbering:{ pattern:'IVR-{MM}',next:1,reset:'never',period:'' } };
    expect(() => parseWorkspace({ ...emptyWorkspace(),clients:[client] })).toThrow();
  });
});
