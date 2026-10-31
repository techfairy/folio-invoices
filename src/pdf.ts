import { jsPDF } from 'jspdf';
import type { TextOptionsLight } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { formatDate, money, totals } from './domain';
import type { Invoice, Party } from './domain';

// The embedded Folio Sans faces combine Noto Sans and Noto Sans Hebrew
// from notofonts/noto-fonts under the SIL OFL in public/fonts/OFL.txt.
let fonts: Promise<[string, string]> | undefined;
function asBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer); let result = '';
  for (let i = 0; i < bytes.length; i += 8192) result += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(result);
}
async function loadFonts(): Promise<[string, string]> {
  if (!fonts) fonts = Promise.all(['Regular', 'Bold'].map(async weight => {
    const response = await fetch(`${import.meta.env.BASE_URL}fonts/NotoSans-${weight}.ttf?v=hebrew-1`);
    if (!response.ok) throw new Error('Could not load PDF fonts. Check your connection and try again.');
    return asBase64(await response.arrayBuffer());
  })).then(result => result as [string, string]).catch(error => { fonts = undefined; throw error; });
  return fonts;
}
export async function buildPdf(invoice: Invoice) {
  const [regular, bold] = await loadFonts();
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  // Stored strings are logical Unicode. Reorder each rendered line to visual
  // order, including AutoTable cells, while preserving Latin runs and numbers.
  doc.internal.events.subscribe('preProcessText', (args: { options: TextOptionsLight }) => {
    Object.assign(args.options, { isInputVisual:false,isOutputVisual:true,isOutputRtl:false,isSymmetricSwapping:true });
  });
  doc.addFileToVFS('NotoSans-Regular.ttf', regular); doc.addFont('NotoSans-Regular.ttf', 'Noto', 'normal');
  doc.addFileToVFS('NotoSans-Bold.ttf', bold); doc.addFont('NotoSans-Bold.ttf', 'Noto', 'bold');
  doc.setFont('Noto'); doc.setTextColor(39, 44, 42);
  doc.setProperties({ title: `Invoice ${invoice.number}`, subject: 'Paid invoice', author: invoice.sender.name, creator: 'Folio' });
  const t = totals(invoice.items, invoice.tax);
  doc.setFontSize(28); doc.text('INVOICE', 190, 25, { align: 'right' });
  doc.setFontSize(11); doc.setTextColor(100, 107, 102); doc.text(`# ${invoice.number}`, 190, 34, { align: 'right' });
  doc.setFillColor(233, 243, 237); doc.roundedRect(164, 41, 26, 8, 2, 2, 'F');
  doc.setTextColor(33, 96, 70); doc.setFont('Noto', 'bold'); doc.setFontSize(9); doc.text('PAID', 177, 46.5, { align: 'center' });
  const party = (p: Party, x: number, y: number, width: number) => {
    doc.setFont('Noto', 'bold'); doc.setFontSize(11); doc.setTextColor(39, 44, 42);
    const name = doc.splitTextToSize(p.name, width); doc.text(name, x, y); y += name.length * 5 + 2;
    doc.setFont('Noto', 'normal'); doc.setFontSize(9); doc.setTextColor(90, 98, 93);
    for (const text of [p.address, p.email, p.taxId ? `Tax / registration ID: ${p.taxId}` : ''].filter(Boolean)) {
      const lines = doc.splitTextToSize(text, width); doc.text(lines, x, y); y += lines.length * 4.5 + 1.5;
    }
    return y;
  };
  const senderEnd = party(invoice.sender, 20, 24, 93);
  const billTop = Math.max(66, senderEnd + 12);
  doc.setFontSize(9); doc.setTextColor(100, 107, 102); doc.text('BILL TO', 20, billTop);
  const clientEnd = party(invoice.client, 20, billTop + 8, 90);
  doc.setFont('Noto', 'normal'); doc.setFontSize(9); doc.setTextColor(100, 107, 102);
  doc.text('Invoice date', 132, billTop + 8); doc.text('Payment date', 132, billTop + 16);
  doc.setTextColor(39, 44, 42); doc.text(formatDate(invoice.date), 190, billTop + 8, { align: 'right' });
  doc.text(formatDate(invoice.paidDate), 190, billTop + 16, { align: 'right' });
  autoTable(doc, {
    startY: Math.max(clientEnd + 12, billTop + 32),
    head: [['Item / description', 'Quantity', 'Rate', 'Amount']],
    body: invoice.items.map((item, i) => [item.description, item.quantity, money(Number(item.rate.replace(',', '.')) * 100, invoice.currency), money(t.lines[i], invoice.currency)]),
    theme: 'plain', margin: { left: 20, right: 20, top: 20, bottom: 22 },
    styles: { font: 'Noto', fontStyle: 'normal', fontSize: 9, cellPadding: { top: 5, bottom: 5, left: 3, right: 3 }, overflow: 'linebreak', textColor: [39,44,42] },
    headStyles: { fillColor: [44,52,47], textColor: 255, fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { lineWidth: { bottom: 0.2 }, lineColor: [228,232,229] },
    columnStyles: { 0: { cellWidth: 88 }, 1: { cellWidth: 21, halign: 'right' }, 2: { cellWidth: 29, halign: 'right' }, 3: { cellWidth: 32, halign: 'right' } },
    rowPageBreak: 'avoid',
  });
  let y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12;
  const reserve = 65;
  if (y + reserve > 272) { doc.addPage(); y = 25; }
  const row = (label: string, value: number, strong = false) => {
    doc.setFont('Noto', strong ? 'bold' : 'normal'); doc.setFontSize(strong ? 11 : 9);
    doc.setTextColor(90,98,93); doc.text(label, 126, y); doc.setTextColor(39,44,42); doc.text(money(value, invoice.currency), 190, y, { align: 'right' }); y += 8;
  };
  row('Subtotal', t.subtotal); row(`Tax (${invoice.tax}%)`, t.taxAmount); row('Total', t.total, true); row('Payment received', t.total);
  doc.setDrawColor(221,229,223); doc.line(126, y-4, 190, y-4); y += 3; row('Balance due', 0, true);
  if (invoice.note.trim()) {
    y += 11;
    doc.setFont('Noto', 'normal'); doc.setFontSize(9); doc.setTextColor(90,98,93);
    const lines: string[] = doc.splitTextToSize(invoice.note, 170);
    for (const line of lines) { if (y > 270) { doc.addPage(); y = 25; } doc.text(line, 20, y); y += 4.5; }
  }
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page); doc.setDrawColor(228,232,229); doc.line(20,281,190,281); doc.setFontSize(8); doc.setFont('Noto','normal'); doc.setTextColor(100,107,102);
    doc.text(`Invoice ${invoice.number}`, 20, 287); doc.text(`${page} / ${pages}`, 190, 287, { align: 'right' });
  }
  return doc;
}
export async function downloadInvoice(invoice: Invoice) {
  const doc = await buildPdf(invoice);
  doc.save(`Invoice-${invoice.number.replace(/[^\p{L}\p{N}._-]/gu, '-')}.pdf`);
}
