# Verification — 2026-10-31

Separate project: `invoice-app`. The existing parent budget application was preserved.

- `npm test`: 26 passing tests. Integer-based currency calculations, decimal commas and fractional quantities, numbering and collision handling, backup validation, migration to separate client counters, timezone-independent saved records, and actual PostgreSQL schema execution through PGlite.
- Database tests: authenticated owners see only their own records; cross-owner writes and anonymous access are rejected; stale revisions fail atomically.
- `npm run test:e2e`: 6 passing browser scenarios. Settings and client creation; issuing an invoice; downloading PDF; preserving historical client details; backup export and restore; multi-page Unicode PDF; stale settings/counter protection; combined client/currency filters with archived and renamed clients; separate client prefixes and independent counters; email/password sign-in and mobile sign-out against a mocked Supabase API.
- `npm run build`: TypeScript and production Vite build pass.
- Production editor layout checked at 320, 390, 768, and 1440px. No document-level horizontal overflow. Neighbouring form sections use zero top padding and one shared bottom-spacing token.
- PDFs rendered and visually inspected: one-page EUR invoice; first and last pages of a seven-page USD invoice with Cyrillic names and descriptions. Table headers repeat; totals and payment balance are readable.
- Local production Lighthouse: mobile 100 performance / 100 accessibility / 100 best practices / 100 SEO; desktop 100 / 100 / 100 / 100. These are measurements of the local unconfigured workspace, not live Google PageSpeed results or a guarantee for the future deployment.
- Fresh finish review identified and led to fixes for mobile sign-out, stale settings overwrites, and validation across timezones. Async reads are invalidated when switching accounts.
- Impeccable detector: one font warning for Arial in the compact document preview. Retained intentionally as a familiar document face; actual PDF embeds licensed Noto Sans.

Not verified live: a real Supabase account, confirmation and reset emails, SMTP delivery, and deployed cross-device synchronization. The owner requested prepared source and setup instructions because there is no Supabase project yet. No remote repository was configured, and no site or database was published.

Generated reports, screenshots, test PDFs, and example backups are in ignored `verification/` and `test-results/`. They are excluded from the source archive.
