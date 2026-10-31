# Folio

Platform: responsive web application, English interface, personal invoicing after payment.

Create and edit clients, issue immutable paid invoices, search history, customize invoice numbering, choose USD or EUR, and download individual PDF invoices. PDFs contain sender and client details, dates, numbered line items with quantity and rate, subtotal, tax, total, payment received, and remaining balance.

Each client owns a separate numbering pattern (including their prefix), next number, and reset cadence. Selecting the client picks that sequence; issuing advances only that client's counter. Settings supplies only the initial template for newly created clients. History can filter by client, currency, and year together, including archived and renamed clients.

React + TypeScript + Vite static build, compatible with GitHub Pages. Supabase email/password authentication and owner-only data. Without configuration, a clearly labelled browser-local mode enables evaluation; it does not pretend to sync. No personal data in source. Export/import backups. Preserve snapshots of sender, client and services on issued invoices. Atomic versioned saves prevent one device from silently overwriting another.

The attached invoice is an approximate reference for the information, not a pixel-exact design or data seed. The existing family-budget application in the parent directory is outside scope.
