# RTO Invoice Management App — Build Plan

A full-stack invoice management app for an automobile RTO consultancy: generate invoices from a Word template, store them in the cloud, manage dealers/customers, track payments, and export reports.

## Assumptions (please correct if wrong)

- **Backend:** Enable **Lovable Cloud** (Postgres + Storage + Auth) now, not "later" — the app is useless without persistence, and enabling it up front avoids a costly refactor. If you truly want it deferred, say so and I'll stub with localStorage.
- **Auth:** Email/password admin login only (no social). First signup becomes admin; additional users need an existing admin to invite.
- **Currency:** INR (₹). GST optional per invoice, default 18%, split as CGST/SGST when intra-state, IGST when inter-state — say if you want a simpler flat GST.
- **Invoice numbering:** Format `INV-YYYY-NNNN` (resets yearly, zero-padded, atomic via DB sequence).
- **Word template:** You upload a `.docx` with placeholders like `{{customer_name}}`, `{{invoice_number}}`, `{{#items}}...{{/items}}`. We'll use **docxtemplater** for rendering (preserves formatting) and **LibreOffice** on a server route for DOCX→PDF conversion.
- **Exports:** Excel via SheetJS (xlsx) client-side.

## Feature Scope

1. **Auth** — Email/password admin login, protected `/dashboard/*` routes.
2. **Dashboard** — Invoice list with search (number, dealer, date range, amount range, payment status), status badges, quick actions.
3. **Invoice Create/Edit** — Form: dealer picker, customer picker (or inline create), line items (description, qty, rate), GST toggle, notes. Auto-calculates subtotal/GST/total. Auto-assigns next invoice number.
4. **Invoice Generation** — On save: render Word template with data → store DOCX in Storage → convert to PDF → store PDF in Storage → save invoice row with URLs.
5. **Invoice Detail** — View data, download DOCX/PDF, mark Paid/Partial/Unpaid with payment date, notes, outstanding balance auto-computed.
6. **Dealers CRUD** — Name, GSTIN, address, phone, email.
7. **Customers CRUD** — Name, phone, address, vehicle details (reg no, make/model).
8. **Template Manager** — Upload/replace `.docx` template, list versions, mark active. Show placeholder reference guide.
9. **Reports** — Export invoice list and payment report to Excel with current filters applied.
10. **Mobile-friendly** — Responsive Tailwind layout, hamburger nav on mobile, cards on small screens instead of tables.

## Data Model (Postgres via Lovable Cloud)

```text
profiles          (id → auth.users, full_name, created_at)
user_roles        (user_id, role: 'admin')            -- separate table, has_role() function
dealers           (id, name, gstin, address, phone, email, state_code)
customers         (id, name, phone, address, vehicle_reg, vehicle_make_model)
invoice_templates (id, name, storage_path, is_active, uploaded_at, uploaded_by)
invoices          (id, invoice_number UNIQUE, dealer_id, customer_id, issue_date,
                   line_items JSONB, subtotal, gst_rate, gst_amount, total,
                   status: 'unpaid'|'partial'|'paid', amount_paid, payment_date,
                   payment_notes, docx_path, pdf_path, template_id, created_by, created_at)
invoice_counters  (year, last_number)                 -- atomic increment via RPC
```

RLS: authenticated users can read/write; admin role required for template management and delete.
Storage buckets: `invoice-templates` (private), `invoices` (private, signed URLs for download).

## Technical Details

- **Stack:** TanStack Start (existing) + Lovable Cloud (Supabase under the hood).
- **Template rendering:** `docxtemplater` + `pizzip` in a server function; template fetched from Storage.
- **PDF conversion:** Server route calls LibreOffice headless (`soffice --convert-to pdf`) — works in the sandbox. If the deployed Worker runtime can't run LibreOffice, fall back to server-side rendering via `docx-pdf` or generating PDF directly with pdf-lib from invoice data (loses exact Word formatting for PDF only; DOCX still matches template).
- **Excel export:** `xlsx` (SheetJS) in the browser.
- **UI:** shadcn components already installed; new design system tokens for a clean, professional look (deep navy + amber accent, not purple).
- **Routes:**
  - `/` — public landing → redirect to `/auth` or `/dashboard`
  - `/auth` — sign in / sign up
  - `/_authenticated/dashboard` — invoice list
  - `/_authenticated/invoices/new`, `/_authenticated/invoices/$id`
  - `/_authenticated/dealers`, `/_authenticated/customers`
  - `/_authenticated/templates`, `/_authenticated/reports`

## Build Order

1. Enable Lovable Cloud, design system, auth pages, protected layout.
2. Schema migration (all tables, RLS, roles, counter RPC, storage buckets).
3. Dealers + Customers CRUD.
4. Template upload/manage.
5. Invoice create form + auto numbering + template rendering + storage.
6. Invoice list + search + detail + payment status.
7. PDF conversion.
8. Excel export + reports.
9. Mobile polish.

## Open Questions

1. Confirm **enable Lovable Cloud now** vs. stub with localStorage.
2. **GST model:** simple flat rate, or full CGST/SGST/IGST split?
3. Do you have a **sample .docx template** to upload now, or should I ship a reasonable default template you can replace later?
4. Should the **first signup auto-become admin**, or do you want to seed a specific admin email?

Reply with answers (or "go ahead with your assumptions") and I'll start building.
