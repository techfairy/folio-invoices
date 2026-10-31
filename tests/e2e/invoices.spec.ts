import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('issue a paid invoice, preserve its snapshot, download PDF, and restore a backup', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror',error => errors.push(error.message));
  await page.goto('/'); await page.getByRole('button',{ name:'Settings',exact:true }).click();
  await page.getByLabel('Name / business name').fill('Example Studio');
  await page.getByLabel('Email (optional)').fill('studio@example.test');
  await page.getByLabel('Address (optional)').fill('Belgrade, Serbia');
  await page.getByLabel('Number pattern').fill('IVR-{SEQ:2}_{MM}/{YYYY}');
  await page.getByLabel('Next number',{ exact:true }).fill('4');
  await page.getByRole('button',{ name:'Save settings' }).click();
  await expect(page.getByRole('status')).toContainText('Settings saved');
  await page.getByRole('button',{ name:'Invoices',exact:false }).first().click();
  await page.getByRole('button',{ name:'New invoice',exact:true }).click();
  await page.getByRole('button',{ name:'Add a new client' }).click();
  await page.getByLabel('Name / business name').fill('Example Client');
  await page.getByLabel('Tax / registration ID (optional)').fill('REG-123456');
  await page.getByRole('button',{ name:'Save client',exact:true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByLabel('Description 1').fill('Technical support & development');
  await page.getByLabel('Rate (EUR)').fill('650');
  await page.getByRole('button',{ name:'Issue invoice',exact:true }).click();
  await expect(page.getByRole('status')).toContainText('saved');
  await expect(page.getByRole('heading',{ level:1 })).toContainText('IVR-04_');
  await expect(page.getByLabel('Invoice preview')).toContainText('REG-123456');
  const dl = page.waitForEvent('download'); await page.getByRole('button',{ name:'Download PDF',exact:true }).click();
  const pdf = await dl; await pdf.saveAs('test-results/invoice.pdf');
  const bytes = await readFile('test-results/invoice.pdf'); expect(bytes.subarray(0,5).toString()).toBe('%PDF-'); expect(bytes.length).toBeGreaterThan(20000);
  await page.getByRole('button',{ name:'Clients',exact:true }).click();
  await page.getByRole('button',{ name:'Edit details',exact:true }).click();
  await page.getByLabel('Name / business name').fill('Changed Client Name');
  await page.getByRole('button',{ name:'Save client',exact:true }).click();
  await page.getByRole('button',{ name:'Invoices',exact:false }).first().click();
  await page.getByRole('button',{ name:/^IVR-04_/ }).click();
  await expect(page.getByLabel('Invoice preview')).toContainText('Example Client');
  await expect(page.getByLabel('Invoice preview')).not.toContainText('Changed Client Name');
  await page.reload(); await expect(page.getByRole('heading',{ level:1 })).toHaveText('Invoices1');
  await page.getByRole('button',{ name:'Settings',exact:true }).click();
  const backupDl = page.waitForEvent('download'); await page.getByRole('button',{ name:'Export backup' }).click();
  const backup = await backupDl; await backup.saveAs('test-results/backup.json');
  await page.getByLabel('Import backup file').setInputFiles('test-results/backup.json');
  await expect(page.getByRole('dialog')).toContainText('1 clients');
  await page.getByRole('button',{ name:'Replace workspace',exact:true }).click();
  await expect(page.getByRole('status')).toContainText('Backup restored');
  await page.setViewportSize({ width:390,height:844 });
  await page.getByRole('button',{ name:'Invoices',exact:false }).first().click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path:'test-results/mobile.png',fullPage:true });
  await page.setViewportSize({ width:1440,height:1000 });
  await page.screenshot({ path:'test-results/desktop.png',fullPage:true });
  expect(errors).toEqual([]);
});

test('long service tables produce a multi-page PDF with Unicode text', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const modulePath = '/src/domain.ts';
    const d = await import(/* @vite-ignore */ modulePath);
    const date = d.today(); const workspace = d.emptyWorkspace();
    workspace.settings.sender = { name:'Тестовая студия / Example Studio',email:'studio@example.test',address:'Belgrade, Serbia',taxId:'REG-123' };
    workspace.invoices = [{ id:'long',clientId:'sample',number:'LONG-001',date,paidDate:date,currency:'USD',sender:workspace.settings.sender,client:{ name:'Пример клиента / Example Client',email:'client@example.test',address:'Example Street 1',taxId:'REG-456' },tax:'20',note:'Thank you for your business.',createdAt:new Date().toISOString(),items:Array.from({ length:70 },(_,i) => ({ id:String(i),description:`Service ${i+1}: Development and technical support — разработка`,quantity:'1.25',rate:'123.45' })) }];
    localStorage.setItem('folio-workspace-v1',JSON.stringify({ revision:1,data:workspace }));
  });
  await page.reload();
  await page.getByRole('button',{ name:'LONG-001',exact:true }).click();
  const dl = page.waitForEvent('download'); await page.getByRole('button',{ name:'Download PDF',exact:true }).click();
  await (await dl).saveAs('test-results/invoice-multipage.pdf');
  expect((await readFile('test-results/invoice-multipage.pdf')).length).toBeGreaterThan(50000);
});

test('a refreshed settings form cannot overwrite another device’s invoice counter', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button',{ name:'Settings',exact:true }).click();
  await page.getByLabel('Name / business name').fill('Local edit');
  await page.evaluate(async () => {
    const modulePath = '/src/domain.ts'; const domain = await import(/* @vite-ignore */ modulePath);
    const data = domain.emptyWorkspace(); data.settings.sender.name = 'Saved on another device'; data.settings.numbering.next = 42;
    localStorage.setItem('folio-workspace-v1',JSON.stringify({ revision:1,data }));
    window.dispatchEvent(new Event('focus'));
  });
  await expect(page.getByRole('alert')).toContainText('changed on another device');
  await expect(page.getByRole('button',{ name:'Save settings',exact:true })).toBeDisabled();
  await expect(page.getByLabel('Name / business name')).toHaveValue('Local edit');
  await page.getByRole('button',{ name:'Load latest settings',exact:true }).click();
  await expect(page.getByLabel('Next number',{ exact:true })).toHaveValue('42');
  await expect(page.getByLabel('Name / business name')).toHaveValue('Saved on another device');
  await expect(page.getByRole('button',{ name:'Save settings',exact:true })).toBeEnabled();
});

test('client filter combines with currency, preserves renamed and archived clients, and fits mobile', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const modulePath='/src/domain.ts'; const d=await import(/* @vite-ignore */ modulePath);
    const data=d.emptyWorkspace(); const date=d.today();
    data.clients=[{ id:'a',name:'Renamed Client',email:'',address:'',taxId:'',archived:false,createdAt:date },{ id:'b',name:'Archived Client',email:'',address:'',taxId:'',archived:true,createdAt:date }];
    data.settings.sender.name='Example Studio';
    data.invoices=[['A-EUR','a','EUR'],['A-USD','a','USD'],['B-EUR','b','EUR']].map(([number,clientId,currency]) => ({ id:number,number,clientId,currency,date,paidDate:date,createdAt:new Date().toISOString(),sender:data.settings.sender,client:{ name:clientId==='a'?'Original Client':'Archived Client',email:'',address:'',taxId:'' },items:[{ id:'item',description:'Completed work',quantity:'1',rate:'100' }],tax:'0',note:'' }));
    localStorage.setItem('folio-workspace-v1',JSON.stringify({ revision:1,data }));
  });
  await page.reload();
  await page.getByLabel('Filter by client').selectOption({ label:'Renamed Client' });
  await expect(page.getByRole('button',{ name:'A-EUR',exact:true })).toBeVisible();
  await expect(page.getByRole('button',{ name:'A-USD',exact:true })).toBeVisible();
  await expect(page.getByRole('button',{ name:'B-EUR',exact:true })).toHaveCount(0);
  await page.getByLabel('Filter by currency').selectOption('USD');
  await expect(page.getByRole('button',{ name:'A-EUR',exact:true })).toHaveCount(0);
  await expect(page.getByRole('button',{ name:'A-USD',exact:true })).toBeVisible();
  await page.getByLabel('Search invoices').fill('no-match');
  await page.getByRole('button',{ name:'Clear filters',exact:true }).click();
  await expect(page.getByLabel('Filter by client')).toHaveValue('');
  await expect(page.getByRole('button',{ name:'B-EUR',exact:true })).toBeVisible();
  await page.getByLabel('Filter by client').selectOption({ label:'Archived Client' });
  await expect(page.getByRole('button',{ name:'B-EUR',exact:true })).toBeVisible();
  await expect(page.getByRole('button',{ name:'A-EUR',exact:true })).toHaveCount(0);
  for (const width of [320,390,768,1440]) {
    await page.setViewportSize({ width,height:900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
});

test('each client uses its own prefix and advances only its own counter', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const modulePath='/src/domain.ts'; const d=await import(/* @vite-ignore */ modulePath); const data=d.emptyWorkspace();
    data.settings.sender.name='Example Studio';
    data.clients=['a','b'].map(id => ({ id,name:id==='a'?'Client Alpha':'Client Beta',email:'',address:'',taxId:'',createdAt:d.today(),archived:false,numbering:{ pattern:id==='a'?'IVR-{SEQ:2}_{MM}/{YYYY}':'DEV-{SEQ:2}_{MM}/{YYYY}',next:id==='a'?4:1,reset:'never',period:'' } }));
    localStorage.setItem('folio-workspace-v1',JSON.stringify({ revision:1,data }));
  });
  await page.reload();
  await page.getByRole('button',{ name:'New invoice',exact:true }).click();
  await page.getByLabel('Bill to').selectOption('a');
  await expect(page.getByLabel('Invoice number',{ exact:false })).toHaveValue(/^IVR-04_/);
  await page.getByLabel('Bill to').selectOption('b');
  await expect(page.getByLabel('Invoice number',{ exact:false })).toHaveValue(/^DEV-01_/);
  await page.getByLabel('Bill to').selectOption('a');
  await page.getByLabel('Description 1').fill('Paid work for Alpha'); await page.getByLabel('Rate (EUR)').fill('100');
  await page.getByRole('button',{ name:'Issue invoice',exact:true }).click();
  await expect(page.getByRole('heading',{ level:1 })).toHaveText(/^IVR-04_/);
  await page.getByRole('button',{ name:'All invoices',exact:true }).click();
  await page.getByRole('button',{ name:'New invoice',exact:true }).click();
  await page.getByLabel('Bill to').selectOption('b');
  await expect(page.getByLabel('Invoice number',{ exact:false })).toHaveValue(/^DEV-01_/);
  await page.getByLabel('Description 1').fill('Paid work for Beta'); await page.getByLabel('Rate (EUR)').fill('200');
  await page.getByRole('button',{ name:'Issue invoice',exact:true }).click();
  await expect(page.getByRole('heading',{ level:1 })).toHaveText(/^DEV-01_/);
  const counters=await page.evaluate(() => {
    const data=JSON.parse(localStorage.getItem('folio-workspace-v1')!).data;
    return { a:data.clients.find((c:{id:string})=>c.id==='a').numbering.next,b:data.clients.find((c:{id:string})=>c.id==='b').numbering.next,global:data.settings.numbering.next };
  });
  expect(counters).toEqual({ a:5,b:2,global:1 });
  await page.getByRole('button',{ name:'Clients',exact:true }).click();
  await page.getByRole('button',{ name:'Edit details',exact:true }).first().click();
  await expect(page.getByRole('dialog').getByLabel('Number pattern')).toHaveValue('IVR-{SEQ:2}_{MM}/{YYYY}');
  await expect(page.getByRole('dialog').getByLabel('Next number',{ exact:true })).toHaveValue('5');
  await page.getByRole('dialog').getByLabel('Number pattern').fill('ALPHA-{SEQ:3}/{YYYY}');
  await page.getByRole('button',{ name:'Save client',exact:true }).click();
  await page.getByRole('button',{ name:'Invoices',exact:false }).first().click();
  await expect(page.getByRole('button',{ name:/^IVR-04_/ })).toBeVisible();
  await page.getByRole('button',{ name:'New invoice',exact:true }).click();
  await page.getByLabel('Bill to').selectOption('a');
  await expect(page.getByLabel('Invoice number',{ exact:false })).toHaveValue(/^ALPHA-005\//);
});
