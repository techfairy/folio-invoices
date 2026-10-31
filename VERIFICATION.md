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

Deployment verified on 2026-10-31 after the owner authorized publication:

- Public source: https://github.com/techfairy/folio-invoices. Live application: https://techfairy.github.io/folio-invoices/.
- GitHub Actions run 41184847152: dependency installation, 26 tests, production build, and Pages deployment all succeeded.
- Supabase project `invoices` (`nwvcrtwiijrdkldipcar`): table, RLS, owner policy, and save function verified in the live database. The setup script uses conditional policy creation without dropping existing policies.
- Real anonymous HTTP requests to read the workspace table and execute the save function both return HTTP 401 / PostgreSQL 42501. SQL also confirms that the anonymous role has neither permission.
- Owner confirmed email and signed in. The authenticated workspace is open in the owner's browser, and a persisted workspace with revision 1 verifies a real cloud save. No synthetic client or invoice was added to the owner's account.
- New registrations were disabled after the owner's account was created. Public auth settings confirm email login enabled and `disable_signup=true`. Confirm-email remains enabled and anonymous sign-ins remain disabled.
- Production site URL and redirect allow-list configured for the published URL and local preview. GitHub holds only the Supabase URL and public publishable key as build variables; no service or secret key was read or uploaded.
- Initial live Lighthouse: performance 100, accessibility 92, best practices 100, SEO 100 for both mobile and desktop. A minor paragraph contrast issue on the sign-in page was corrected after this measurement.

Not verified live: password-reset email delivery and simultaneous editing across two separate signed-in devices. The same conflict logic and security schema passed local automated tests.

Generated reports, screenshots, test PDFs, and example backups are in ignored `verification/` and `test-results/`. They are excluded from the source archive.
