import { test, expect } from '@playwright/test';
import { emptyWorkspace } from '../../src/domain';

test('email sign-in, authenticated workspace and mobile sign-out with a mocked cloud API', async ({ page }) => {
  const user = { id:'00000000-0000-0000-0000-000000000001',aud:'authenticated',email:'owner@example.test',app_metadata:{ provider:'email',providers:['email'] },user_metadata:{},created_at:new Date().toISOString() };
  const token = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub:user.id,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600 })).toString('base64url')}.mock-signature`;
  await page.route('https://folio-test.supabase.co/**',async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/auth/v1/token') await route.fulfill({ json:{ access_token:token,refresh_token:'mock-refresh',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user } });
    else if (path === '/auth/v1/user') await route.fulfill({ json:user });
    else if (path === '/auth/v1/logout') await route.fulfill({ status:204,body:'' });
    else if (path === '/rest/v1/invoice_workspaces') await route.fulfill({ json:{ revision:1,data:emptyWorkspace() } });
    else await route.fulfill({ status:400,json:{ message:`Unexpected test request ${path}` } });
  });
  await page.goto('/');
  await expect(page.getByRole('heading',{ name:'Welcome back.' })).toBeVisible();
  await page.getByLabel('Email',{ exact:true }).fill(user.email);
  await page.getByLabel('Password',{ exact:true }).fill('example-test-password');
  await page.getByRole('button',{ name:'Sign in',exact:true }).click();
  await expect(page.getByRole('heading',{ level:1 })).toHaveText('Invoices0');
  await expect(page.getByText('Local mode.',{ exact:false })).toHaveCount(0);
  await page.setViewportSize({ width:390,height:844 });
  await expect(page.getByRole('button',{ name:'Sign out',exact:true }).filter({ visible:true })).toHaveCount(1);
  await page.getByRole('button',{ name:'Sign out',exact:true }).filter({ visible:true }).click();
  await expect(page.getByRole('heading',{ name:'Welcome back.' })).toBeVisible();
  await expect(page.getByRole('heading',{ level:1,name:/Invoices/ })).toHaveCount(0);
});
