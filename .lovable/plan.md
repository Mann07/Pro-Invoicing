
## 1. DOCX → PDF via Adobe PDF Services

Replace the current jsPDF client-side redraw with a server-rendered PDF that comes straight from the populated Word template.

- Request Adobe credentials (`ADOBE_PDF_CLIENT_ID`, `ADOBE_PDF_CLIENT_SECRET`) via `add_secret` after the user confirms. They come from an Adobe Developer Console project with **PDF Services API** enabled.
- New server function `renderInvoicePdf` in `src/lib/invoice.functions.ts`:
  1. Loads the invoice's stored DOCX from the `invoices` storage bucket (or renders it on-demand from the active template if missing).
  2. Gets an Adobe access token, uploads the DOCX asset, submits a Create PDF job, polls until done, downloads the resulting PDF.
  3. Uploads the PDF to the `invoices` bucket at `<invoice_id>.pdf`, stores the path on the invoice row, returns a short-lived signed URL.
- Invoice detail page (`src/routes/_authenticated/invoices.$id.tsx`): "Download PDF" calls `renderInvoicePdf` and downloads the signed URL. Cache it — if `pdf_path` already exists and the invoice hasn't changed since, reuse it. Regenerate automatically when the invoice is edited or the template changes.
- Delete `src/lib/pdf-client.ts` and remove `jspdf` / `jspdf-autotable` from `package.json`.
- The PDF is now literally the Word file rendered by Adobe: fonts, tables, header/footer, logo, signature, margins, page size — all preserved.

## 2. Quantity & Rate as plain numeric inputs

In `src/routes/_authenticated/invoices.new.tsx` line-item row:

- Replace `<Input type="number">` for Qty and Rate with plain `<Input inputMode="decimal">` fields using a regex-filtered `onChange` that accepts digits and one decimal point.
- Placeholders: `Qty` and `Rate`. No spinner arrows (native number stepper removed by switching off `type="number"`).
- Amount stays auto-computed as `qty * rate` and remains read-only.
- Same treatment on the invoice edit path if it uses the same component.

## 3. Single-admin authentication

Convert the app from multi-user to a single administrator account.

**Database (one migration):**
- Drop the `handle_new_user` trigger on `auth.users` and the function.
- Keep `profiles` and `user_roles` tables (harmless), but no longer auto-populate them.
- Tighten the overly-permissive RLS flagged by the security scanner: change `customers`, `dealers`, `invoices` policies from `USING(true)` to `USING(has_role(auth.uid(),'admin'))` with matching `WITH CHECK`. Same for the `invoices` storage bucket policies. This solves the current-view security errors as a side effect of going single-admin.
- Seed the admin: insert the chosen email into `auth.users` via `supabaseAdmin.auth.admin.createUser` inside a one-shot server function invoked from a small setup script (or the migration uses the Auth admin API via `pg_net` — simpler: a `setup-admin.functions.ts` we run once). Delete all other existing `auth.users` rows and their `user_roles` first.

**Supabase Auth config:**
- Call `supabase--configure_auth` to disable public signups (`enable_signup: false`), keep email/password enabled, disable email confirmations, and enable password recovery emails.

**Frontend:**
- `src/routes/auth.tsx`: remove the Sign Up tab/form entirely. Login form only, plus a "Forgot password?" link.
- New `src/routes/forgot-password.tsx` (public): email input → `supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/reset-password' })`.
- New `src/routes/reset-password.tsx` (public): detects `type=recovery` in the URL hash, shows a new-password form, calls `supabase.auth.updateUser({ password })`.
- New `src/routes/_authenticated/settings.tsx`: profile page with a "Change password" form (`supabase.auth.updateUser({ password })` after confirming the current one via re-auth).
- Sidebar: add "Settings" link; remove any user-management surfaces (none currently exist beyond auth).

## 4. Ask the user for the admin email

Before running the migration/seed, I'll ask for the fresh admin email + initial password (via `add_secret` for the password so it's not in chat).

## Technical notes

- Adobe PDF Services REST flow: `POST /token` → `POST /assets` (get upload URI) → `PUT` the DOCX bytes → `POST /operation/createpdf` → poll `Location` → `GET` download URI → fetch bytes. All done inside `createServerFn` handler; `fetch` + `Buffer` are available on the Worker runtime.
- Adobe free tier is 500 transactions/month — enough for this volume.
- Regeneration trigger: any mutation of `invoices` clears `pdf_path`; next download re-renders.
- RLS tightening + single-admin also resolves the 4 error-level and 2 warn-level findings in the current security scan view.

## Out of scope

- No multi-tenant features, no invitations, no role management UI.
- Existing invoice data is preserved.
