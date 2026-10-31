import { defineConfig } from '@playwright/test';
import base from './playwright.config';
export default defineConfig(base, {
  testDir:'tests/cloud',
  outputDir:'test-results/cloud',
  use:{ ...base.use,baseURL:'http://127.0.0.1:4189' },
  webServer:{ command:'npm run dev -- --port 4189 --strictPort',url:'http://127.0.0.1:4189',reuseExistingServer:false,env:{ VITE_SUPABASE_URL:'https://folio-test.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test' } },
});
