import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const url = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (Boolean(url) !== Boolean(key)) throw new Error('Set both Supabase URL and publishable key, or leave both empty for local mode.');
  if (key) {
    let role = '';
    try { role = JSON.parse(Buffer.from(key.split('.')[1] ?? '', 'base64url').toString()).role; } catch { /* New publishable format is not a JWT. */ }
    if (!key.startsWith('sb_publishable_') && role !== 'anon') throw new Error('Only a publishable key or legacy anon key is allowed. Never expose secret keys.');
    if (!url?.startsWith('https://') || url.includes('your-project')) throw new Error('Use the real HTTPS URL of your Supabase project.');
  }
  return {
    base: './',
    plugins: [react()],
    server: { fs: { deny: ['.env', '.env.*', '**/.git/**', '**/.local/**'] } },
    test: { include: ['tests/**/*.test.ts'], testTimeout: 30000 },
  };
});
