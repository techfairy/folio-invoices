/* THESIS: A personal document workspace that makes recording paid work a short, clear task.
OWN-WORLD: White sheets, graphite tables, forest-green actions; system type and tabular money.
STORY: Set your details, add a client, record paid services, then keep and download the invoice.
FIRST VIEWPORT: Navigation rail, invoice heading and create action, currency-separated totals, searchable history.
FORM: Familiar Operate workspace; a two-column editor keeps the document beside its source fields. */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, CheckCheck, ChevronRight, Download, FilePlus2, FileText, FolderOpen, Globe2, LogOut, Plus, Search, Settings2, ShieldCheck, Trash2, Users, X } from 'lucide-react';
import { blankParty, decimal, formatDate, money, numberFor, parseWorkspace, today, totals, validateInvoice, validateNumbering, validatePattern } from './domain';
import type { Client, ClientDetails, Currency, Invoice, Item, Numbering, Party, Settings, Workspace } from './domain';
import { cloud, ConflictError, downloadFile, loadWorkspace, saveWorkspace } from './storage';
import type { Snapshot } from './storage';

type Page = 'invoices' | 'clients' | 'settings';
type Draft = { clientId: string; date: string; paidDate: string; currency: Currency; items: Item[]; tax: string; note: string };
const newItem = (): Item => ({ id: crypto.randomUUID(), description: '', quantity: '1', rate: '' });
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.';

function Brand() { return <span className="brand"><span className="brand-mark" aria-hidden="true">f</span><span>folio.</span></span>; }
function Button({ children, className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) { return <button className={`button ${className}`} {...props}>{children}</button>; }
function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) { return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>; }
function PartyFields({ value, onChange }: { value: Party; onChange: (value: Party) => void }) {
  const change = (key: keyof Party, text: string) => onChange({ ...value, [key]: text });
  return <>
    <Field label="Name / business name"><input required maxLength={120} value={value.name} onChange={e => change('name', e.target.value)} autoComplete="organization" placeholder="Full name or registered business" /></Field>
    <div className="field-grid"><Field label="Email (optional)"><input type="email" maxLength={254} value={value.email} onChange={e => change('email', e.target.value)} autoComplete="email" placeholder="name@example.com" /></Field>
    <Field label="Tax / registration ID (optional)"><input maxLength={120} value={value.taxId} onChange={e => change('taxId', e.target.value)} placeholder="Tax or business registration number" /></Field></div>
    <Field label="Address (optional)"><textarea rows={3} maxLength={300} value={value.address} onChange={e => change('address', e.target.value)} autoComplete="street-address" placeholder="Street, city, postal code, country" /></Field>
  </>;
}

function Auth({ recovery, onRecovered }: { recovery: boolean; onRecovered: () => void }) {
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset'>('signin');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState(''); const [error, setError] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(''); setMessage('');
    const redirect = location.origin + location.pathname;
    try {
      if (recovery) {
        const { error } = await cloud!.auth.updateUser({ password }); if (error) throw error;
        onRecovered();
      } else if (mode === 'reset') {
        const { error } = await cloud!.auth.resetPasswordForEmail(email, { redirectTo: redirect }); if (error) throw error;
        setMessage('Check your email for a password reset link.');
      } else if (mode === 'signup') {
        const { data, error } = await cloud!.auth.signUp({ email, password, options: { emailRedirectTo: redirect } }); if (error) throw error;
        if (!data.session) setMessage('Check your email to confirm your account, then sign in.');
      } else {
        const { error } = await cloud!.auth.signInWithPassword({ email, password }); if (error) throw error;
      }
    } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  }
  return <main className="auth-layout"><div className="auth-story"><Brand /><div><span className="eyebrow">A little less paperwork</span><h1>Good work.<br />All on record.</h1><p>One place for your clients, paid invoices, and the next PDF you need to send.</p></div><span className="auth-foot"><ShieldCheck size={18} /> Your workspace. Your records.</span></div>
    <div className="auth-main"><form className="auth-form" onSubmit={submit}><span className="mini-icon"><FileText size={25} /></span><h2>{recovery ? 'Set a new password' : mode === 'signup' ? 'Your work, organized.' : mode === 'reset' ? 'Reset your password' : 'Welcome back.'}</h2><p>{recovery ? 'Choose a new password for your account.' : mode === 'signup' ? 'Create your personal invoice workspace.' : mode === 'reset' ? 'We’ll send you a secure reset link.' : 'Sign in to your invoice workspace.'}</p>
      {!recovery && <Field label="Email"><input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></Field>}
      {(recovery || mode !== 'reset') && <Field label="Password" hint={recovery || mode === 'signup' ? 'Use at least 10 characters.' : undefined}><input type="password" required minLength={recovery || mode === 'signup' ? 10 : 1} value={password} onChange={e => setPassword(e.target.value)} autoComplete={recovery || mode === 'signup' ? 'new-password' : 'current-password'} /></Field>}
      {error && <p className="error-box" role="alert">{error}</p>}{message && <p className="success-box" role="status">{message}</p>}
      <Button className="primary full" disabled={busy}>{busy ? 'Please wait…' : recovery ? 'Save password' : mode === 'signup' ? 'Create account' : mode === 'reset' ? 'Send reset link' : 'Sign in'}<ArrowRight size={17} /></Button>
      {!recovery && <div className="auth-links"><button type="button" onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setMessage(''); setError(''); }}>{mode === 'signup' ? 'Already have an account? Sign in' : 'New here? Create an account'}</button>{mode === 'signin' && <button type="button" onClick={() => { setMode('reset'); setError(''); setMessage(''); }}>Forgot password?</button>}{mode === 'reset' && <button type="button" onClick={() => setMode('signin')}>Back to sign in</button>}</div>}
    </form></div></main>;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null); const [authReady, setAuthReady] = useState(!cloud); const [recovery, setRecovery] = useState(false);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null); const [loadError, setLoadError] = useState(''); const [busy, setBusy] = useState(false);
  const [page, setPage] = useState<Page>('invoices'); const [draft, setDraft] = useState<Draft | null>(null); const [view, setView] = useState<Invoice | null>(null);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null); const [clientEdit, setClientEdit] = useState<Client | 'new' | null>(null);
  const [pdfBusy, setPdfBusy] = useState<string | null>(null); const [discard, setDiscard] = useState<Page | 'close' | null>(null);
  const saving = useRef(false); const latestSnapshot = useRef(snapshot); latestSnapshot.current = snapshot;
  const account = useRef<string | null>(null); const readEpoch = useRef(0);
  const notify = useCallback((text: string, error = false) => setNotice({ text, error }), []);
  const refresh = useCallback(async () => {
    const epoch = ++readEpoch.current;
    try { const next = await loadWorkspace(); if (epoch === readEpoch.current) { setSnapshot(next); setLoadError(''); } }
    catch (error) { if (epoch === readEpoch.current) setLoadError(errorText(error)); }
  }, []);
  useEffect(() => {
    if (!cloud) return;
    let live = true;
    cloud.auth.getSession().then(({ data, error }) => { if (live) { account.current = data.session?.user.id ?? null; setSession(data.session); setAuthReady(true); if (error) setLoadError(error.message); } });
    const { data: { subscription } } = cloud.auth.onAuthStateChange((event, current) => {
      if (account.current !== (current?.user.id ?? null)) {
        account.current = current?.user.id ?? null; readEpoch.current++; latestSnapshot.current = null;
        setSnapshot(null); setLoadError(''); setDraft(null); setView(null); setClientEdit(null); setNotice(null); setPage('invoices');
      }
      setSession(current); setAuthReady(true); if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      if (event === 'SIGNED_OUT') { setSnapshot(null); setDraft(null); setView(null); setNotice(null); setPage('invoices'); }
    });
    return () => { live = false; subscription.unsubscribe(); };
  }, []);
  useEffect(() => { if (authReady && (!cloud || session)) void refresh(); }, [authReady, session?.user.id, refresh]);
  useEffect(() => {
    if (cloud && !session) return;
    const update = () => { if (!saving.current) void refresh(); };
    window.addEventListener('focus', update); window.addEventListener('storage', update);
    return () => { window.removeEventListener('focus', update); window.removeEventListener('storage', update); };
  }, [session?.user.id, refresh]);
  useEffect(() => {
    if (!draft) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [draft]);
  async function commit(next: Workspace) {
    const current = latestSnapshot.current;
    if (saving.current || !current) return false;
    saving.current = true; setBusy(true);
    try { const saved = await saveWorkspace(next, current.revision); latestSnapshot.current = saved; setSnapshot(saved); return true; }
    catch (error) { if (error instanceof ConflictError) await refresh(); notify(errorText(error), true); return false; }
    finally { saving.current = false; setBusy(false); }
  }
  function navigate(next: Page) {
    if (draft) { setDiscard(next); return; }
    setView(null); setPage(next); setClientEdit(null); setNotice(null);
  }
  function closeEditor() { if (draft) setDiscard('close'); else setView(null); }
  function startInvoice(source?: Invoice) {
    if (!snapshot) return;
    const s = snapshot.data.settings;
    setDraft({ clientId: source?.clientId ?? '', date: today(), paidDate: today(), currency: source?.currency ?? s.currency, items: source ? source.items.map(item => ({ ...item, id: crypto.randomUUID() })) : [newItem()], tax: source?.tax ?? s.tax, note: source?.note ?? s.note });
    setView(null); setPage('invoices'); setNotice(null);
  }
  async function issueInvoice(e: FormEvent) {
    e.preventDefault(); if (!snapshot || !draft) return;
    try {
      const data = snapshot.data; const client = data.clients.find(c => c.id === draft.clientId && !c.archived);
      if (!client) throw new Error('Choose an active client.');
      const generated = numberFor(client.numbering, draft.date, data.invoices);
      const invoice: Invoice = { ...draft, id: crypto.randomUUID(), number: generated.number, sender: { ...data.settings.sender }, client: { name: client.name, email: client.email, address: client.address, taxId: client.taxId }, createdAt: new Date().toISOString() };
      validateInvoice(invoice);
      if (await commit({ ...data, invoices: [invoice, ...data.invoices], clients: data.clients.map(c => c.id === client.id ? { ...c,numbering:generated.numbering } : c) })) {
        setDraft(null); setView(invoice); notify(`Invoice ${invoice.number} saved. Ready to download.`);
      }
    } catch (error) { notify(errorText(error), true); }
  }
  async function pdf(invoice: Invoice) {
    setPdfBusy(invoice.id);
    try { const { downloadInvoice } = await import('./pdf'); await downloadInvoice(invoice); }
    catch (error) { notify(errorText(error), true); } finally { setPdfBusy(null); }
  }
  async function signOut() {
    const { error } = await cloud!.auth.signOut(); if (error) notify(error.message, true);
  }
  if (!authReady) return <main className="loading-screen" role="status"><Brand /><p>Opening your workspace…</p></main>;
  if (cloud && (!session || recovery)) return <Auth recovery={recovery} onRecovered={() => setRecovery(false)} />;
  if (!snapshot) return <main className="loading-screen"><Brand />{loadError ? <><p className="error-box" role="alert">{loadError}</p><Button onClick={() => void refresh()}>Try again</Button>{cloud && <Button onClick={() => void signOut()}>Sign out</Button>}</> : <p role="status">Loading your records…</p>}</main>;
  const data = snapshot.data;
  return <div className="app-shell">
    <aside className="sidebar"><a className="brand-link" href="#" onClick={e => { e.preventDefault(); navigate('invoices'); }}><Brand /></a><div className="workspace-label">Personal workspace</div>
      <nav aria-label="Main navigation">{([{ key: 'invoices', label: 'Invoices', icon: FileText }, { key: 'clients', label: 'Clients', icon: Users }, { key: 'settings', label: 'Settings', icon: Settings2 }] as const).map(item => <button key={item.key} aria-current={page === item.key ? 'page' : undefined} className={page === item.key ? 'nav-item active' : 'nav-item'} onClick={() => navigate(item.key)}><item.icon size={19} />{item.label}{item.key === 'invoices' && <span className="nav-count">{data.invoices.length}</span>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="workspace-status"><span className="status-dot" /><span>{cloud ? 'Private cloud workspace' : 'Local workspace'}</span></div><div className="user-row"><span className="avatar">{(data.settings.sender.name || session?.user.email || 'You').slice(0,1).toUpperCase()}</span><div><strong>{data.settings.sender.name || 'Your workspace'}</strong><small>{session?.user.email || 'Browser storage'}</small></div>{cloud && <button className="icon-button" aria-label="Sign out" title="Sign out" disabled={busy || !!draft} onClick={() => void signOut()}><LogOut size={17} /></button>}</div></div>
    </aside>
    <div className="main-wrap"><div className="workspace-top"><span><FolderOpen size={16} /> Workspace <ChevronRight size={14} /> <strong>{draft ? 'New invoice' : view ? view.number : page[0].toUpperCase() + page.slice(1)}</strong></span><span className="private-label"><ShieldCheck size={15} /> Private</span></div>
      {!cloud && <div className="local-banner"><Globe2 size={17} /><span><strong>Local mode.</strong> Records stay in this browser. Connect Supabase to sign in and sync devices.</span><button onClick={() => navigate('settings')}>Setup guide <ArrowUpRight size={14} /></button></div>}
      {cloud && <div className="mobile-account"><span>{session?.user.email}</span><button className="text-button" disabled={busy || !!draft} onClick={() => void signOut()}><LogOut size={15} /> Sign out</button></div>}
      <main id="main-content" className="main-content">
        {notice && <div className={notice.error ? 'notice error-box' : 'notice success-box'} role={notice.error ? 'alert' : 'status'}><span>{notice.text}</span><button className="icon-button" aria-label="Dismiss notification" onClick={() => setNotice(null)}><X size={17} /></button></div>}
        {loadError && <div className="error-box" role="alert">{loadError} <button onClick={() => void refresh()}>Retry</button></div>}
        {(draft || view) ? <>
          <div className="editor-heading"><button className="text-button" onClick={closeEditor}><ArrowLeft size={17} /> All invoices</button><span>{draft ? 'Create a record of completed, paid work.' : 'Saved invoice · details are preserved'}</span></div>
          {draft ? <InvoiceEditor draft={draft} setDraft={setDraft} data={data} onSubmit={issueInvoice} busy={busy} onAddClient={() => setClientEdit('new')} onSettings={() => navigate('settings')} /> : view && <><div className="page-heading"><div><h1>{view.number}</h1><p>Issued {formatDate(view.date)} to {view.client.name}</p></div><div className="button-row"><Button onClick={() => startInvoice(view)}><FilePlus2 size={17} /> Use as template</Button><Button className="primary" disabled={pdfBusy !== null} onClick={() => void pdf(view)}><Download size={17} />{pdfBusy === view.id ? 'Preparing PDF…' : 'Download PDF'}</Button></div></div><div className="saved-preview"><InvoicePreview invoice={view} /></div></>}
        </> : page === 'invoices' ? <InvoiceHistory data={data} onNew={() => startInvoice()} onView={setView} onPdf={invoice => void pdf(invoice)} pdfBusy={pdfBusy} onSettings={() => navigate('settings')} />
          : page === 'clients' ? <Clients data={data} editing={clientEdit} setEditing={setClientEdit} busy={busy} commit={commit} notify={notify} onNewInvoice={client => { startInvoice(); setDraft(current => current && { ...current, clientId: client.id }); }} />
          : <SettingsPage data={data} busy={busy} commit={commit} notify={notify} />}
      </main><footer className="app-footer"><span>Folio · A little less paperwork.</span><span>{cloud ? 'Connected to your private workspace' : 'Remember to export a backup'}</span></footer>
    </div>
    {draft && clientEdit === 'new' && <ClientDialog defaultNumbering={data.settings.numbering} busy={busy} onClose={() => setClientEdit(null)} onSave={async party => {
      const client: Client = { ...party, id: crypto.randomUUID(), createdAt: today(), archived: false };
      if (await commit({ ...data, clients: [...data.clients, client] })) { setDraft(d => d && { ...d, clientId: client.id }); setClientEdit(null); return true; } return false;
    }} />}
    {discard && <ConfirmDialog title="Leave this invoice?" onClose={() => setDiscard(null)}><p>Your unsaved invoice will be discarded. Saved invoices stay in your history.</p><div className="button-row"><Button onClick={() => setDiscard(null)}>Keep editing</Button><Button className="primary" onClick={() => { const next = discard; setDraft(null); setDiscard(null); setClientEdit(null); if (next !== 'close') setPage(next); }}>Discard invoice</Button></div></ConfirmDialog>}
  </div>;
}

function InvoiceHistory({ data, onNew, onView, onPdf, pdfBusy, onSettings }: { data: Workspace; onNew: () => void; onView: (i: Invoice) => void; onPdf: (i: Invoice) => void; pdfBusy: string | null; onSettings: () => void }) {
  const [query, setQuery] = useState(''); const [currency, setCurrency] = useState('all'); const [year, setYear] = useState('all'); const [clientId, setClientId] = useState('');
  const invoices = data.invoices.filter(i => `${i.number} ${i.client.name} ${i.items.map(item => item.description).join(' ')}`.toLowerCase().includes(query.toLowerCase()) && (currency === 'all' || i.currency === currency) && (year === 'all' || i.date.startsWith(year)) && (!clientId || i.clientId === clientId));
  const years = [...new Set(data.invoices.map(i => i.date.slice(0,4)))].sort().reverse();
  const clients = [...new Map(data.invoices.map(i => [i.clientId,{ id:i.clientId,name:data.clients.find(c => c.id === i.clientId)?.name ?? i.client.name }])).values()].sort((a,b) => a.name.localeCompare(b.name));
  return <>
    <div className="page-heading"><div><span className="eyebrow">Your paperwork, in order</span><h1>Invoices<span className="heading-count">{data.invoices.length}</span></h1><p>A clear record of your work and the payments received.</p></div><Button className="primary" onClick={onNew}><Plus size={18} /> New invoice</Button></div>
    {!data.settings.sender.name && <div className="setup-strip"><span className="setup-icon"><Settings2 size={20} /></span><div><strong>Make it yours.</strong><p>Add your name and business details once. We’ll put them on every invoice.</p></div><Button className="quiet" onClick={onSettings}>Set up your details <ArrowRight size={16} /></Button></div>}
    <div className="ledger-summary"><div><span>Payments recorded · EUR</span><strong>{money(data.invoices.filter(i => i.currency === 'EUR').reduce((sum,i) => sum + totals(i.items,i.tax).total,0),'EUR')}</strong><small>{data.invoices.filter(i => i.currency === 'EUR').length} invoices</small></div><div><span>Payments recorded · USD</span><strong>{money(data.invoices.filter(i => i.currency === 'USD').reduce((sum,i) => sum + totals(i.items,i.tax).total,0),'USD')}</strong><small>{data.invoices.filter(i => i.currency === 'USD').length} invoices</small></div><div className="summary-note"><CheckCheck size={21} /><p>Completed work.<br />Payment received.<br /><strong>Everything on record.</strong></p></div></div>
    <section className="history-section" aria-label="Invoice history"><div className="section-heading"><h2>Invoice history</h2><span>{invoices.length} {invoices.length === 1 ? 'invoice' : 'invoices'}</span></div><div className="list-tools"><label className="search-field"><Search size={18} /><input aria-label="Search invoices" placeholder="Search number, client, or service…" value={query} onChange={e => setQuery(e.target.value)} /></label><div className="filter-row"><select className="client-filter" aria-label="Filter by client" value={clientId} onChange={e => setClientId(e.target.value)}><option value="">All clients</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select><select aria-label="Filter by currency" value={currency} onChange={e => setCurrency(e.target.value)}><option value="all">All currencies</option><option value="EUR">EUR</option><option value="USD">USD</option></select><select aria-label="Filter by year" value={year} onChange={e => setYear(e.target.value)}><option value="all">All years</option>{years.map(y => <option key={y}>{y}</option>)}</select></div></div>
      {invoices.length ? <div className="table-wrap"><table className="invoice-table"><thead><tr><th>Invoice</th><th>Client</th><th>Date</th><th>Status</th><th className="right">Amount</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{invoices.map(i => <tr key={i.id}><td data-label="Invoice"><button className="invoice-link" onClick={() => onView(i)}><FileText size={17} />{i.number}</button></td><td data-label="Client"><strong>{i.client.name}</strong><small>{i.items[0].description.slice(0,55)}</small></td><td data-label="Date">{formatDate(i.date)}</td><td data-label="Status"><span className="paid-badge"><Check size={13} /> Paid</span></td><td data-label="Amount" className="right amount">{money(totals(i.items,i.tax).total,i.currency)}</td><td className="row-actions"><button className="icon-button" disabled={pdfBusy !== null} aria-label={`Download ${i.number}`} title="Download PDF" onClick={() => onPdf(i)}><Download size={18} /></button><button className="icon-button" aria-label={`View ${i.number}`} title="View invoice" onClick={() => onView(i)}><ArrowUpRight size={18} /></button></td></tr>)}</tbody></table></div>
        : <div className="empty-state"><span className="empty-document"><FileText size={34} strokeWidth={1.4} /><span><Check size={12} /></span></span><h3>{data.invoices.length ? 'No invoices match your search' : 'Your first invoice starts here'}</h3><p>{data.invoices.length ? 'Try another client, invoice number, or filter.' : 'Add a client, enter your paid work, and create a PDF you can send in a moment.'}</p>{data.invoices.length ? <Button onClick={() => { setQuery(''); setCurrency('all'); setYear('all'); setClientId(''); }}>Clear filters</Button> : <Button onClick={onNew}><Plus size={17} /> Create your first invoice</Button>}</div>}
    </section><div className="history-footnote"><ShieldCheck size={15} /> Saved invoices keep the original client and business details.</div>
  </>;
}

function InvoiceEditor({ draft, setDraft, data, onSubmit, busy, onAddClient, onSettings }: { draft: Draft; setDraft: (d: Draft) => void; data: Workspace; onSubmit: (e: FormEvent) => void; busy: boolean; onAddClient: () => void; onSettings: () => void }) {
  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft({ ...draft, [key]: value });
  const client = data.clients.find(c => c.id === draft.clientId);
  let number = 'Choose a client first'; let calculationError = '';
  try { if (client) number = numberFor(client.numbering,draft.date,data.invoices).number; } catch (error) { calculationError = errorText(error); }
  const invoice: Invoice = { ...draft, sender: data.settings.sender, client: client ?? blankParty(), number, id: '', createdAt: '' };
  let total = 0;
  try { total = totals(draft.items.map(i => ({ ...i, rate: i.rate || '0', quantity: i.quantity || '0' })),draft.tax || '0').total; } catch (error) { calculationError = errorText(error); }
  return <><div className="page-heading"><div><h1>New invoice</h1><p>The work is done. Let’s make it official.</p></div><span className="editor-step"><span /> Unsaved invoice</span></div>
    <div className="editor-grid"><form className="editor-form" onSubmit={onSubmit}>
      {!data.settings.sender.name && <div className="warning-box">Add your business name before issuing an invoice. <button type="button" className="text-button" onClick={onSettings}>Open Settings <ArrowRight size={14} /></button></div>}
      <section className="form-section"><div className="section-heading"><h2>Client & dates</h2><span className="paid-badge"><Check size={13} /> Paid invoice</span></div><Field label="Bill to"><select required value={draft.clientId} onChange={e => update('clientId',e.target.value)}><option value="">Choose a client</option>{data.clients.filter(c => !c.archived).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field><button type="button" className="text-button add-client-link" onClick={onAddClient}><Plus size={15} /> Add a new client</button>
        <div className="field-grid"><Field label="Invoice date"><input type="date" required value={draft.date} onChange={e => update('date',e.target.value)} /></Field><Field label="Payment received on"><input type="date" required max={today()} value={draft.paidDate} onChange={e => update('paidDate',e.target.value)} /></Field></div><div className="field-grid"><Field label="Currency"><select value={draft.currency} onChange={e => update('currency',e.target.value as Currency)}><option value="EUR">EUR · Euro</option><option value="USD">USD · US Dollar</option></select></Field><Field label="Invoice number" hint="Assigned when you issue the invoice."><input value={number} readOnly /></Field></div>
      </section>
      <section className="form-section"><div className="section-heading"><h2>Services</h2><span>{draft.items.length} {draft.items.length === 1 ? 'item' : 'items'}</span></div><div className="line-items">{draft.items.map((item,index) => <div className="line-item" key={item.id}><Field label={`Description ${index+1}`}><textarea required maxLength={2000} rows={2} placeholder="e.g. Website development — October" value={item.description} onChange={e => update('items',draft.items.map(i => i.id === item.id ? { ...i, description: e.target.value } : i))} /></Field><div className="line-numbers"><Field label="Quantity"><input required inputMode="decimal" value={item.quantity} onChange={e => update('items',draft.items.map(i => i.id === item.id ? { ...i, quantity: e.target.value } : i))} /></Field><Field label={`Rate (${draft.currency})`}><input required inputMode="decimal" placeholder="0.00" value={item.rate} onChange={e => update('items',draft.items.map(i => i.id === item.id ? { ...i, rate: e.target.value } : i))} /></Field><button type="button" className="icon-button delete-line" disabled={draft.items.length === 1} aria-label={`Remove item ${index+1}`} onClick={() => update('items',draft.items.filter(i => i.id !== item.id))}><Trash2 size={17} /></button></div></div>)}</div><Button type="button" className="quiet" disabled={draft.items.length >= 100} onClick={() => update('items',[...draft.items,newItem()])}><Plus size={16} /> Add line item</Button></section>
      <section className="form-section"><h2>Finishing touches</h2><Field label="Tax (%)" hint="Leave at 0 if no tax applies."><input inputMode="decimal" required value={draft.tax} onChange={e => update('tax',e.target.value)} /></Field><Field label="Note (optional)"><textarea rows={3} maxLength={4000} value={draft.note} onChange={e => update('note',e.target.value)} placeholder="A short note for your client" /></Field></section>
      {calculationError && <p className="error-box" role="alert">{calculationError}</p>}<div className="issue-bar"><div><small>Total paid</small><strong>{money(total,draft.currency)}</strong></div><Button className="primary" disabled={busy || !!calculationError || !data.settings.sender.name}>{busy ? 'Saving…' : 'Issue invoice'}<ArrowRight size={17} /></Button></div><p className="form-footnote">Issuing saves a permanent copy. You can download the PDF next.</p>
    </form><aside className="preview-column"><div className="preview-label"><FileText size={16} /> Live preview <span>A4 document</span></div><InvoicePreview invoice={invoice} draft /></aside></div>
  </>;
}

function InvoicePreview({ invoice, draft = false }: { invoice: Invoice; draft?: boolean }) {
  let t = { lines: invoice.items.map(() => 0), subtotal: 0, taxAmount: 0, total: 0 };
  try { t = totals(invoice.items.map(i => ({ ...i, rate: i.rate || '0', quantity: i.quantity || '0' })),invoice.tax || '0'); } catch { /* Inline form explains invalid input. */ }
  const party = (p: Party, fallback: string) => <><strong>{p.name || fallback}</strong>{p.address && <span className="preserve-lines">{p.address}</span>}{p.email && <span>{p.email}</span>}{p.taxId && <span>Tax / registration ID: {p.taxId}</span>}</>;
  return <article className="invoice-sheet" aria-label="Invoice preview"><div className="document-top"><div className="document-party">{party(invoice.sender,'Your business name')}</div><div className="document-title"><h2>INVOICE</h2><p># {invoice.number}</p><span className="paid-badge"><Check size={12} /> {draft ? 'Paid · preview' : 'Paid'}</span></div></div><div className="document-address"><div className="document-party"><span className="document-caption">Bill to</span>{party(invoice.client,'Client name')}</div><dl><div><dt>Invoice date</dt><dd>{invoice.date ? formatDate(invoice.date) : '—'}</dd></div><div><dt>Payment date</dt><dd>{invoice.paidDate ? formatDate(invoice.paidDate) : '—'}</dd></div></dl></div>
    <table className="document-table"><thead><tr><th>Item / description</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead><tbody>{invoice.items.map((item,index) => <tr key={item.id}><td>{item.description || 'Your service description'}</td><td>{item.quantity || '—'}</td><td>{money(Number((item.rate || '0').replace(',','.')) * 100 || 0,invoice.currency)}</td><td>{money(t.lines[index],invoice.currency)}</td></tr>)}</tbody></table>
    <dl className="document-totals"><div><dt>Subtotal</dt><dd>{money(t.subtotal,invoice.currency)}</dd></div><div><dt>Tax ({invoice.tax || 0}%)</dt><dd>{money(t.taxAmount,invoice.currency)}</dd></div><div className="document-total"><dt>Total</dt><dd>{money(t.total,invoice.currency)}</dd></div><div><dt>Payment received</dt><dd>{money(t.total,invoice.currency)}</dd></div><div className="document-balance"><dt>Balance due</dt><dd>{money(0,invoice.currency)}</dd></div></dl>{invoice.note && <p className="document-note preserve-lines">{invoice.note}</p>}<div className="document-footer"><span>{invoice.number}</span><span>{draft ? 'Preview · not issued' : 'Payment received in full'}</span></div>
  </article>;
}

function Clients({ data, editing, setEditing, busy, commit, notify, onNewInvoice }: { data: Workspace; editing: Client | 'new' | null; setEditing: (c: Client | 'new' | null) => void; busy: boolean; commit: (d: Workspace) => Promise<boolean>; notify: (s: string,e?: boolean) => void; onNewInvoice: (c: Client) => void }) {
  const [search,setSearch] = useState(''); const [showArchived,setShowArchived] = useState(false);
  const clients = data.clients.filter(c => c.archived === showArchived && `${c.name} ${c.email}`.toLowerCase().includes(search.toLowerCase()));
  return <><div className="page-heading"><div><span className="eyebrow">The people you work with</span><h1>Clients<span className="heading-count">{data.clients.filter(c => !c.archived).length}</span></h1><p>Keep their details handy for the next invoice.</p></div><Button className="primary" onClick={() => setEditing('new')}><Plus size={18} /> Add client</Button></div>
    <div className="list-tools"><label className="search-field"><Search size={18} /><input aria-label="Search clients" placeholder="Search name or email…" value={search} onChange={e => setSearch(e.target.value)} /></label><Button className="quiet" onClick={() => setShowArchived(!showArchived)}>{showArchived ? 'Show active clients' : 'Show archived'}</Button></div>
    <section className="client-list" aria-label="Clients">{clients.length ? clients.map(client => <div className="client-row" key={client.id}><span className="avatar client-avatar">{client.name[0]?.toUpperCase()}</span><div className="client-details"><h2>{client.name}</h2><p>{client.email || client.taxId || 'No additional details'}</p><small>{data.invoices.filter(i => i.clientId === client.id).length} invoices issued</small></div><div className="button-row"><Button className="quiet" onClick={() => setEditing(client)}>Edit details</Button>{!client.archived && <Button onClick={() => onNewInvoice(client)}><Plus size={16} /> Invoice</Button>}<Button className="quiet" onClick={async () => { if (await commit({ ...data, clients: data.clients.map(c => c.id === client.id ? { ...c, archived: !c.archived } : c) })) notify(client.archived ? 'Client restored.' : 'Client archived. Previous invoices are preserved.'); }} disabled={busy}>{client.archived ? 'Restore' : 'Archive'}</Button></div></div>) : <div className="empty-state"><span className="mini-icon"><Users size={28} /></span><h3>{showArchived ? 'No archived clients' : search ? 'No matching clients' : 'A familiar face for every invoice'}</h3><p>{showArchived ? 'Archived clients stay out of your client picker. Their invoices are always kept.' : search ? 'Try another name or email address.' : 'Save your first client’s details and use them whenever you record your work.'}</p>{!showArchived && !search && <Button onClick={() => setEditing('new')}><Plus size={17} /> Add your first client</Button>}</div>}</section>
    {editing && <ClientDialog key={typeof editing === 'string' ? editing : editing.id} value={editing === 'new' ? undefined : data.clients.find(c => c.id === editing.id) ?? editing} defaultNumbering={data.settings.numbering} busy={busy} onClose={() => setEditing(null)} onSave={async party => {
      const next = editing === 'new' ? [...data.clients,{ ...party,id: crypto.randomUUID(),createdAt: today(),archived:false }] : data.clients.map(c => c.id === editing.id ? { ...c,...party } : c);
      if (await commit({ ...data,clients:next })) { setEditing(null); notify('Client details saved.'); return true; } return false;
    }} />}
  </>;
}

function ConfirmDialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = ref.current; d?.showModal(); return () => { d?.close(); }; },[]);
  return <dialog ref={ref} className="dialog" onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === ref.current) onClose(); }} aria-labelledby="dialog-title"><div className="dialog-heading"><h2 id="dialog-title">{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={20} /></button></div>{children}</dialog>;
}
function NumberingFields({ value, onChange, invoices = [] }: { value: Numbering; onChange: (n: Numbering) => void; invoices?: Invoice[] }) {
  let example=''; let error='';
  try { example=numberFor(value,today(),invoices).number; } catch (err) { error=errorText(err); }
  return <>
    <Field label="Number pattern" hint="Include the client’s prefix, e.g. IVR-{SEQ:2}_{MM}/{YYYY}."><input required maxLength={80} value={value.pattern} onChange={e => onChange({ ...value,pattern:e.target.value })} /></Field>
    <div className="token-help"><span><code>{'{SEQ:2}'}</code> Number, padded to 2 digits</span><span><code>{'{YYYY}'}</code> Year</span><span><code>{'{YY}'}</code> Short year</span><span><code>{'{MM}'}</code> Month</span><span><code>{'{DD}'}</code> Day</span></div>
    <div className="field-grid"><Field label="Next number"><input type="number" required min={1} max={999999999} step={1} value={value.next} onChange={e => onChange({ ...value,next:Number(e.target.value),period:'' })} /></Field><Field label="Reset counter"><select value={value.reset} onChange={e => onChange({ ...value,reset:e.target.value as Numbering['reset'],period:'' })}><option value="never">Never</option><option value="year">Every year</option><option value="month">Every month</option></select></Field></div>
    <div className="number-example"><span>Next invoice preview</span><strong>{error || example}</strong></div>
  </>;
}
function ClientDialog({ value, defaultNumbering, busy, onClose, onSave }: { value?: Client; defaultNumbering: Numbering; busy: boolean; onClose: () => void; onSave: (p: ClientDetails) => Promise<boolean> }) {
  const [party,setParty] = useState<Party>(value ? { name:value.name,email:value.email,address:value.address,taxId:value.taxId } : blankParty());
  const [numbering,setNumbering] = useState<Numbering>(() => value ? structuredClone(value.numbering) : { ...defaultNumbering,period:'' });
  const [error,setError] = useState('');
  const original = useRef(JSON.stringify(value)); const stale = original.current !== JSON.stringify(value);
  return <ConfirmDialog title={value ? 'Edit client' : 'Add a client'} onClose={onClose}><p>The details below will appear in the “Bill to” section.</p>{stale && <p className="warning-box" role="alert">This client changed on another device. Close and reopen this form to review the latest details.</p>}<form onSubmit={async e => {
    e.preventDefault(); if (!party.name.trim() || stale) return; setError('');
    try { validateNumbering(numbering); await onSave({ ...party,name:party.name.trim(),numbering }); } catch (err) { setError(errorText(err)); }
  }}><PartyFields value={party} onChange={setParty} /><section className="client-numbering"><h3>Invoice numbering</h3><p>Set this client’s prefix and independent invoice counter.</p><NumberingFields value={numbering} onChange={setNumbering} /></section>{error && <p className="error-box" role="alert">{error}</p>}<div className="dialog-actions"><Button type="button" onClick={onClose}>Cancel</Button><Button className="primary" disabled={busy || stale}>{busy ? 'Saving…' : 'Save client'}<Check size={16} /></Button></div></form></ConfirmDialog>;
}

function SettingsPage({ data, busy, commit, notify }: { data: Workspace; busy: boolean; commit: (d: Workspace) => Promise<boolean>; notify: (s: string,e?: boolean) => void }) {
  const [settings,setSettings] = useState<Settings>(() => structuredClone(data.settings)); const [pending,setPending] = useState<Workspace | null>(null); const fileRef = useRef<HTMLInputElement>(null);
  const [baseline,setBaseline] = useState(() => JSON.stringify(data.settings));
  const stale = baseline !== JSON.stringify(data.settings);
  const set = <K extends keyof Settings>(key: K,value: Settings[K]) => setSettings({ ...settings,[key]:value });
  let patternError = '';
  try { validateNumbering(settings.numbering); } catch (error) { patternError = errorText(error); }
  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      if (stale) throw new Error('Settings changed on another device. Load the latest settings before saving.');
      validatePattern(settings.numbering.pattern); decimal(settings.tax);
      const next = { ...settings,sender:{ ...settings.sender,name:settings.sender.name.trim() } };
      if (!next.sender.name) throw new Error('Enter your name or business name.');
      // Changing the reset cadence or next number starts an explicitly chosen counter period.
      if (settings.numbering.reset !== data.settings.numbering.reset || settings.numbering.next !== data.settings.numbering.next) next.numbering = { ...settings.numbering,period:'' };
      if (await commit({ ...data,settings:next })) { setSettings(structuredClone(next)); setBaseline(JSON.stringify(next)); notify('Settings saved. New invoices will use these details.'); }
    } catch (error) { notify(errorText(error),true); }
  }
  return <><div className="page-heading"><div><span className="eyebrow">Once set, always ready</span><h1>Settings</h1><p>Your details, your numbering, your way of working.</p></div></div><div className="settings-layout"><form className="settings-form" onSubmit={save}>
    {stale && <div className="warning-box" role="alert"><p>Settings or the invoice counter changed on another device. Load the latest values before making further changes. This replaces your unsaved settings.</p><Button type="button" onClick={() => { setSettings(structuredClone(data.settings)); setBaseline(JSON.stringify(data.settings)); }}>Load latest settings</Button></div>}
    <section className="form-section"><h2>Your business details</h2><p className="section-description">Shown as the sender on every new invoice.</p><PartyFields value={settings.sender} onChange={value => set('sender',value)} /></section>
    <section className="form-section"><h2>Default numbering for new clients</h2><p className="section-description">A starting template only. Set each client’s prefix and independent counter in Clients → Edit details. Changes here do not affect existing clients.</p><NumberingFields value={settings.numbering} onChange={value => set('numbering',value)} /></section>
    <section className="form-section"><h2>Invoice defaults</h2><div className="field-grid"><Field label="Default currency"><select value={settings.currency} onChange={e => set('currency',e.target.value as Currency)}><option value="EUR">EUR · Euro</option><option value="USD">USD · US Dollar</option></select></Field><Field label="Default tax (%)"><input required inputMode="decimal" value={settings.tax} onChange={e => set('tax',e.target.value)} /></Field></div><Field label="Default note"><textarea rows={3} maxLength={4000} value={settings.note} onChange={e => set('note',e.target.value)} /></Field></section><div className="settings-save"><Button className="primary" disabled={busy || !!patternError || stale}>{busy ? 'Saving…' : 'Save settings'}<Check size={17} /></Button><span>Existing invoices keep their original details.</span></div>
    </form><aside className="settings-aside"><section><span className="mini-icon"><ShieldCheck size={23} /></span><h2>Your records, safely kept</h2><p>{cloud ? 'Your records belong to your account. Sign in on another device to continue where you left off.' : 'You are using local mode. Records stay in this browser until you connect Supabase.'}</p>{!cloud && <div className="setup-help"><strong>Enable online sync</strong><ol><li>Create a Supabase project.</li><li>Run <code>supabase/schema.sql</code>.</li><li>Set the two values from <code>.env.example</code>.</li><li>Build and deploy again.</li></ol><p>The full setup guide is in the project README.</p></div>}</section><section><h2>Backup & restore</h2><p>Keep an extra copy of your clients, invoices, and settings.</p><Button className="full" onClick={() => { downloadFile(new Blob([JSON.stringify(data,null,2)],{ type:'application/json' }),`folio-backup-${today()}.json`); }}><Download size={17} /> Export backup</Button><Button className="quiet full" onClick={() => fileRef.current?.click()}>Import backup <ArrowUpRight size={16} /></Button><input ref={fileRef} hidden type="file" accept=".json,application/json" aria-label="Import backup file" onChange={async e => { const file = e.target.files?.[0]; e.target.value = ''; if (!file) return; try { if (file.size > 15000000) throw new Error('Choose a backup smaller than 15 MB.'); setPending(parseWorkspace(JSON.parse(await file.text()))); } catch (error) { notify(errorText(error),true); } }} /><small>Backups contain personal and client details. Store them privately.</small></section><section className="about-folio"><Brand /><p>A little less paperwork.<br />A little more time for your work.</p></section></aside></div>
    {pending && <ConfirmDialog title="Restore this backup?" onClose={() => setPending(null)}><p>This backup contains <strong>{pending.clients.length} clients</strong> and <strong>{pending.invoices.length} invoices</strong>. It will replace the current workspace, including settings.</p><p>Export your current data first if you want to keep a copy.</p><div className="button-row"><Button onClick={() => setPending(null)}>Cancel</Button><Button className="primary" disabled={busy} onClick={async () => { if (await commit(pending)) { setSettings(structuredClone(pending.settings)); setBaseline(JSON.stringify(pending.settings)); setPending(null); notify('Backup restored.'); } }}>{busy ? 'Restoring…' : 'Replace workspace'}</Button></div></ConfirmDialog>}
  </>;
}
