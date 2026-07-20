
## 1. Client-side DOCX → PDF via browser print

The server continues to generate the DOCX from the uploaded Word template (source of truth). PDF is produced in the user's browser by rendering that DOCX and triggering the browser's native "Save as PDF" print dialog. No servers, no installs, no third-party accounts.

**Library:** `docx-preview` (MIT, ~200KB, pure JS). It renders a `.docx` into a real HTML DOM tree that mirrors the Word layout — fonts, tables, borders, images, headers, footers, page breaks, page size — using the DOCX's own styles.

**Flow in `src/routes/_authenticated/invoices.$id.tsx`:**
1. "Download DOCX" — unchanged, direct download from storage.
2. "Save as PDF" (new) — fetches the DOCX bytes from storage, opens a hidden print iframe with print-tuned CSS (`@page` size/margins from the DOCX section props, `-webkit-print-color-adjust: exact`), renders via `docx-preview` into the iframe, then calls `iframe.contentWindow.print()`. The user picks "Save as PDF" as the destination in the standard browser print dialog (Chrome/Edge/Safari/Firefox all have this built in) — same one click as printing any page.
3. A small on-screen note next to the button: *"In the print dialog, set Destination to 'Save as PDF' and Margins to 'Default'."*

**Remove:**
- `src/lib/pdf-client.ts` (jsPDF redraw of the invoice — inconsistent with the DOCX template).
- `jspdf` and `jspdf-autotable` from `package.json`.
- The `pdf_path` column and server-side PDF storage stay in the schema unused for now — no migration needed to drop them.

**Install:** `bun add docx-preview`.

## 2. Quantity & Rate as plain numeric inputs

In `src/routes/_authenticated/invoices.new.tsx` (and the edit surface if any):
- Replace `<Input type="number">` for Qty and Rate with `<Input inputMode="decimal">` filtered by regex `^\d*\.?\d*$`. No native spinner arrows.
- Placeholders: `Qty` and `Rate`.
- Amount stays auto-computed (`qty * rate`), read-only.

## 3. Single-admin authentication

Convert from multi-user to a single administrator account and tighten the current-view RLS findings.

**Database migration:**
- Drop trigger `on_auth_user_created` on `auth.users` and function `handle_new_user()`.
- Rewrite the permissive `USING(true)` policies on `customers`, `dealers`, `invoices` to `USING(has_role(auth.uid(),'admin'))` with matching `WITH CHECK`. Same tightening for the `invoices` storage bucket policies (bucket_id + admin role).
- Restrict `invoice_counters` and `invoice_templates` reads to admins (both current-view warnings).
- Revoke `EXECUTE` on `next_invoice_number`, `next_invoice_number_for_dealer`, and `has_role` from `anon`; keep `EXECUTE` for `authenticated` since server functions call them (resolves the two SECURITY DEFINER lints for the anon role).

**Admin seeding (after migration approval):**
- Ask for the initial admin password via `add_secret` (`ADMIN_INITIAL_PASSWORD`).
- One-shot server function `seed-admin.functions.ts` (invoke once via the invoke tool): deletes any existing `auth.users` rows, creates `dattauto0510@gmail.com` via `supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true })`, inserts the matching `profiles` and `user_roles` (admin) rows. File deleted after successful run.

**Supabase Auth config** (via `supabase--configure_auth`): `disable_signup: true`, `auto_confirm_email: true`, `external_anonymous_users_enabled: false`.

**Frontend:**
- `src/routes/auth.tsx` — remove the Sign Up tab entirely. Keep only the Login form and add a "Forgot password?" link.
- New public route `src/routes/forgot-password.tsx` — email input → `supabase.auth.resetPasswordForEmail(email, { redirectTo: ${origin}/reset-password })`.
- New public route `src/routes/reset-password.tsx` — reads recovery token from URL hash, shows new-password form, calls `supabase.auth.updateUser({ password })`.
- New protected route `src/routes/_authenticated/settings.tsx` — "Change password" form (calls `supabase.auth.updateUser({ password })`).
- Sidebar in `src/routes/_authenticated/route.tsx` — add Settings link.

## Files touched

- **New:** `src/routes/forgot-password.tsx`, `src/routes/reset-password.tsx`, `src/routes/_authenticated/settings.tsx`, `src/lib/docx-to-pdf.ts` (browser print helper), `src/lib/seed-admin.functions.ts` (temporary).
- **Edited:** `src/routes/auth.tsx`, `src/routes/_authenticated/route.tsx`, `src/routes/_authenticated/invoices.$id.tsx`, `src/routes/_authenticated/invoices.new.tsx`, `package.json`.
- **Deleted:** `src/lib/pdf-client.ts`, `src/lib/seed-admin.functions.ts` (after run).

## Out of scope

- No multi-user, roles UI, invitations, or user management.
- No server-side PDF generation and no third-party conversion service.
- Existing invoice, dealer, and vendor data preserved.
