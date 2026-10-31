export type Currency = 'EUR' | 'USD';
export type Party = { name: string; email: string; address: string; taxId: string };
export type ClientDetails = Party & { numbering: Numbering };
export type Client = ClientDetails & { id: string; createdAt: string; archived: boolean };
export type Item = { id: string; description: string; quantity: string; rate: string };
export type Numbering = { pattern: string; next: number; reset: 'never' | 'year' | 'month'; period: string };
export type Settings = { sender: Party; currency: Currency; numbering: Numbering; note: string; tax: string };
export type Invoice = {
  id: string; number: string; date: string; paidDate: string; currency: Currency;
  sender: Party; client: Party; clientId: string; items: Item[]; tax: string;
  note: string; createdAt: string;
};
export type Workspace = { schema: 1; clients: Client[]; invoices: Invoice[]; settings: Settings };
export const blankParty = (): Party => ({ name: '', email: '', address: '', taxId: '' });
export const emptyWorkspace = (): Workspace => ({
  schema: 1, clients: [], invoices: [], settings: {
    sender: blankParty(), currency: 'EUR',
    numbering: { pattern: 'INV-{SEQ:3}/{YYYY}', next: 1, reset: 'year', period: '' },
    note: 'Thank you for your business.', tax: '0',
  },
});
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + 'T12:00:00Z');
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
export const formatDate = (value: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(value + 'T12:00:00Z'));
export const money = (minor: number, currency: Currency) => new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(minor / 100);
// Decimal inputs are converted to scaled integers before any multiplication.
export function decimal(value: string, places = 2): number {
  if (!new RegExp(`^\\d+(?:[.,]\\d{1,${places}})?$`).test(value.trim())) throw new Error(`Enter a positive number with at most ${places} decimal places.`);
  const [whole, fraction = ''] = value.trim().replace(',', '.').split('.');
  const result = Number(whole) * 10 ** places + Number(fraction.padEnd(places, '0'));
  if (!Number.isSafeInteger(result) || result > 100_000_000_000) throw new Error('The amount is too large.');
  return result;
}
export function totals(items: Item[], tax: string) {
  const lines = items.map(item => {
    const result = Math.round(decimal(item.quantity, 3) * decimal(item.rate) / 1000);
    if (!Number.isSafeInteger(result)) throw new Error('The line amount is too large.');
    return result;
  });
  const subtotal = lines.reduce((a, b) => a + b, 0);
  const taxRate = decimal(tax);
  if (taxRate > 10000) throw new Error('Tax must be between 0 and 100%.');
  const taxAmount = Math.round(subtotal * taxRate / 10000);
  if (!Number.isSafeInteger(subtotal + taxAmount) || subtotal + taxAmount > 100_000_000_000) throw new Error('The invoice total is too large.');
  return { lines, subtotal, taxAmount, total: subtotal + taxAmount };
}
export function validatePattern(pattern: string) {
  if (!pattern.trim() || pattern.length > 80) throw new Error('Use a numbering pattern of 1–80 characters.');
  if (!/\{SEQ(?::[1-6])?\}/.test(pattern)) throw new Error('Include {SEQ} or {SEQ:2} in the pattern.');
  if (/[{}]/.test(pattern.replace(/\{(?:SEQ(?::[1-6])?|YYYY|YY|MM|DD)\}/g, ''))) throw new Error('Use only {SEQ}, {SEQ:2}, {YYYY}, {YY}, {MM}, or {DD} tokens.');
}
export function validateNumbering(n: Numbering) {
  if (!n || !['never','month','year'].includes(n.reset) || typeof n.period !== 'string') throw new Error('Invalid numbering settings.');
  validatePattern(n.pattern);
  if (!Number.isSafeInteger(n.next) || n.next < 1 || n.next > 999999999) throw new Error('Next number must be between 1 and 999999999.');
}
export function numberFor(n: Numbering, date: string, invoices: Invoice[]) {
  validatePattern(n.pattern);
  if (!validDate(date)) throw new Error('Choose a valid invoice date.');
  const period = n.reset === 'month' ? date.slice(0, 7) : n.reset === 'year' ? date.slice(0, 4) : 'all';
  let sequence = n.period && n.period !== period ? 1 : n.next;
  if (!Number.isSafeInteger(sequence) || sequence < 1 || sequence > 999999999) throw new Error('Next number must be between 1 and 999999999.');
  const render = () => n.pattern.replace(/\{(SEQ(?::([1-6]))?|YYYY|YY|MM|DD)\}/g, (_, token: string, padding: string) => token.startsWith('SEQ') ? String(sequence).padStart(Number(padding || 1), '0') : ({ YYYY: date.slice(0,4), YY: date.slice(2,4), MM: date.slice(5,7), DD: date.slice(8,10) }[token]!));
  const used = new Set(invoices.map(invoice => invoice.number.toLowerCase()));
  while (used.has(render().toLowerCase())) sequence++;
  return { number: render(), numbering: { ...n, next: sequence + 1, period } };
}
export function validateInvoice(invoice: Invoice, issuing = true) {
  if (!invoice.sender.name.trim()) throw new Error('Add your business name in Settings first.');
  if (!invoice.client.name.trim()) throw new Error('Choose a client.');
  if (!validDate(invoice.date) || !validDate(invoice.paidDate)) throw new Error('Choose valid invoice and payment dates.');
  if (issuing && invoice.paidDate > today()) throw new Error('Payment date cannot be in the future for a paid invoice.');
  if (invoice.items.length < 1 || invoice.items.length > 100) throw new Error('Add between 1 and 100 service lines.');
  invoice.items.forEach(item => {
    if (!item.description.trim() || item.description.length > 2000) throw new Error('Each service needs a description of 1–2000 characters.');
    if (decimal(item.quantity, 3) <= 0) throw new Error('Quantity must be greater than zero.');
  });
  if (totals(invoice.items, invoice.tax).total <= 0) throw new Error('The invoice total must be greater than zero.');
}
export function parseWorkspace(input: unknown): Workspace {
  const data = input as Workspace;
  const partyOK = (p: Party) => p && ['name', 'email', 'address', 'taxId'].every(k => typeof p[k as keyof Party] === 'string' && p[k as keyof Party].length <= 4000);
  if (!data || data.schema !== 1 || !Array.isArray(data.clients) || !Array.isArray(data.invoices) || !data.settings || !partyOK(data.settings.sender)) throw new Error('This is not a valid Folio backup.');
  if (!['EUR','USD'].includes(data.settings.currency)) throw new Error('Invalid settings in backup.');
  validateNumbering(data.settings.numbering);
  decimal(data.settings.tax);
  if (decimal(data.settings.tax) > 10000 || typeof data.settings.note !== 'string' || data.settings.note.length > 4000) throw new Error('Invalid invoice defaults.');
  const ids = new Set<string>(), numbers = new Set<string>();
  for (const client of data.clients) {
    if (!partyOK(client) || typeof client.id !== 'string' || ids.has(client.id) || typeof client.archived !== 'boolean' || !validDate(client.createdAt)) throw new Error('Invalid or duplicate client in backup.');
    if (client.numbering !== undefined) validateNumbering(client.numbering);
    ids.add(client.id);
  }
  ids.clear();
  for (const invoice of data.invoices) {
    if (!partyOK(invoice.sender) || !partyOK(invoice.client) || typeof invoice.id !== 'string' || ids.has(invoice.id) || typeof invoice.number !== 'string' || !invoice.number || invoice.number.length > 120 || numbers.has(invoice.number.toLowerCase()) || !['USD','EUR'].includes(invoice.currency) || typeof invoice.note !== 'string' || invoice.note.length > 4000 || typeof invoice.clientId !== 'string' || typeof invoice.createdAt !== 'string' || !Array.isArray(invoice.items)) throw new Error('Invalid or duplicate invoice in backup.');
    if (invoice.items.some(item => !item || typeof item.id !== 'string' || typeof item.description !== 'string' || typeof item.quantity !== 'string' || typeof item.rate !== 'string')) throw new Error('Invalid invoice lines.');
    validateInvoice(invoice, false); ids.add(invoice.id); numbers.add(invoice.number.toLowerCase());
  }
  // Older local workspaces and backups had one shared numbering configuration.
  // Copy it to each client without changing any previously issued document.
  return { ...data, clients: data.clients.map(client => ({ ...client,numbering:client.numbering ?? { ...data.settings.numbering,period:'' } })) };
}
