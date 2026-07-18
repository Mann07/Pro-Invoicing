# Invoice Preview Step

Add a confirmation preview between filling the new-invoice form and actually creating/storing the invoice, so you can verify fields and totals before a number is assigned and files are generated.

## Flow change

Current: **Fill form → Create invoice** (assigns number, renders DOCX, stores row) → Detail page with download.

New: **Fill form → Preview → Confirm & Create** → Detail page with download.

The "Create invoice" button on `src/routes/_authenticated/invoices.new.tsx` becomes **"Preview invoice"** and opens a full preview instead of calling the server. From the preview the user can either **Back to edit** (returns to the form with all values intact) or **Confirm & create** (runs the existing `createInvoice` server function, then navigates to the detail page).

No invoice number is drawn, no DOCX is rendered, and no row is inserted until the user confirms — matching today's behavior of only committing on submit.

## Preview contents

A single on-page preview (modal dialog, mobile-friendly) that mirrors the invoice layout the user already sees on the detail page:

- Dealer block (name, GSTIN, address, phone, email) — resolved from the selected dealer
- Customer block (name, vehicle reg + make/model, phone, address)
- Issue date
- Line items table (#, description, qty, rate, amount)
- Subtotal, GST rate + amount (or "GST not applied"), Total — all formatted as INR
- Notes
- A muted note: "Invoice number will be assigned on confirm."

Actions in the preview footer: **Back to edit**, **Confirm & create** (shows the same busy state as today).

## Technical notes

- Edit only `src/routes/_authenticated/invoices.new.tsx`. No server, schema, or other route changes.
- Add local state `previewOpen: boolean`. Form `onSubmit` runs the existing validation, then sets `previewOpen = true` instead of calling `createFn`.
- Move the current `createFn` call into a new `confirmCreate()` handler wired to the preview's confirm button; keep the existing `busy` flag, toast, and navigation to `/invoices/$id`.
- Resolve dealer/customer objects for display by looking them up in the already-loaded `dealers` and `customers` query results by id — no extra fetches.
- Render the preview in the existing shadcn `Dialog` component (already used elsewhere in the app) with `max-w-3xl` and internal scroll so it works on mobile.
- Reuse `formatINR` and `formatDate` from `src/lib/format.ts`.
