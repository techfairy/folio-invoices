import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
export default defineConfig({
  testDir:'tests/e2e', workers:1, fullyParallel:false, timeout:45000,
  use:{ baseURL:'http://127.0.0.1:4188', viewport:{ width:1440,height:1000 },headless:true,launchOptions:{ executablePath:existsSync(chrome) ? chrome : existsSync(edge) ? edge : undefined },trace:'retain-on-failure' },
  webServer:{ command:'npm run dev -- --port 4188 --strictPort',url:'http://127.0.0.1:4188',reuseExistingServer:!process.env.CI,env:{ VITE_SUPABASE_URL:'',VITE_SUPABASE_PUBLISHABLE_KEY:'' } },
});
