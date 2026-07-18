# Dealer Invoicing — Revision Plan

Rebrand app, restructure invoices around dealer-scoped numbering, add HSN/SAC + amount-in-words, and rename customers → vendors. Existing routes/server functions are extended; no rewrite.

## 1. Rebrand: "RTO Invoicing" → "Dealer Invoicing"

Update title/description/OG in `src/routes/__root.tsx`, sidebar brand in `_authenticated/route.tsx`, landing hero in `index.tsx`, and auth heading in `auth.tsx`.

## 2. Dealer master — new fields

Add to `dealers`:
- `nickname text` — internal tracking label (shown in dealer lists/search, **never** in generated invoices).
- `invoice_name text` — legal name printed on the invoice (falls back to `name` if blank).
- `invoice_prefix text not null` — e.g. `EMIBM-`, `KAT-`. Editable.
- `contact_person text`, `notes text` (spec lists them; cheap to add now).

Update `dealers.tsx` form + table: nickname column visible internally, invoice_name + prefix editable. Search matches nickname too.

Server invoice render uses `dealer.invoice_name ?? dealer.name` — nickname never enters the docx payload.

## 3. Terminology: Customers → Vendors (UI only)

Keep the `customers` table + `customer_id` FK; rename in UI only to avoid a destructive migration.
- Rename `customers.tsx` route file → `vendors.tsx`, update sidebar link and all labels.
- Short code comment notes the alias.

Invoice creation adds a **Bill Type** toggle: **Dealer** (default, no vendor row shown) or **Vendor** (shows vendor picker; dealer still selected for prefix/numbering).

## 4. Dealer-scoped invoice numbering

Per-dealer sequences derived from the highest existing number for that dealer's prefix. Manual edits push the next suggestion forward.

New RPC `next_invoice_number_for_dealer(_dealer_id uuid)`:
- Reads dealer's `invoice_prefix`.
- Finds max numeric suffix among existing invoices `WHERE dealer_id = ? AND invoice_number LIKE prefix || '%'`.
- Returns `prefix || lpad(max+1, 3, '0')` (3-digit like `EMIBM-025`).

Unique index `(dealer_id, invoice_number)` prevents duplicates. Server insert catches the unique-violation and returns a friendly error; client also does a blur-time uniqueness check.

Old `next_invoice_number()` + `invoice_counters` stay in place (unused) — non-destructive; removable later.

## 5. Invoice creation flow

Rework `invoices.new.tsx`:
- Step 1: pick Dealer → immediately call RPC and populate an **editable** Invoice Number input.
- Bill Type toggle (Dealer/Vendor) as above.
- Line-item row gains **HSN/SAC** input (small, between Description and Qty).
- **Amount in words** displays under Total (auto-computed) and is included in the preview + docx.
- Preview + confirm dialog keeps existing shape, with new columns/rows.

## 6. Server function updates

`src/lib/invoice.functions.ts` `createInvoice`:
- Accept `invoice_number` (required) and `hsn_sac` per line item.
- Drop server call to `next_invoice_number()`.
- Compute `amount_in_words` and pass into template data alongside items with `hsn_sac`.
- Use `dealer.invoice_name ?? dealer.name` in the docx payload (nickname excluded).

Zod: `LineItemSchema` gains `hsn_sac: z.string().optional()`; input gains `invoice_number: z.string()`.

## 7. Invoice detail + PDF

- `invoices.$id.tsx`: add HSN/SAC column, Amount-in-words line under total.
- `pdf-client.ts`: same additions so the client PDF matches.
- Templates page: extend placeholder reference with `{hsn_sac}` (inside items loop) and `{amount_in_words}`.

## 8. Amount-in-words helper

Small pure-JS helper `toIndianWordsINR(total)` in `src/lib/format.ts` — Indian lakh/crore grouping, output like `Rupees Eighteen Thousand Four Hundred Only`. Shared by client preview, PDF, and server render.

## 9. Migration (single call)

```sql
ALTER TABLE public.dealers
  ADD COLUMN IF NOT EXISTS nickname text,
  ADD COLUMN IF NOT EXISTS invoice_name text,
  ADD COLUMN IF NOT EXISTS invoice_prefix text,
  ADD COLUMN IF NOT EXISTS contact_person text,
  ADD COLUMN IF NOT EXISTS notes text;

UPDATE public.dealers SET invoice_prefix = 'INV-' WHERE invoice_prefix IS NULL;
ALTER TABLE public.dealers ALTER COLUMN invoice_prefix SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS invoices_dealer_number_unique
  ON public.invoices (dealer_id, invoice_number);

CREATE OR REPLACE FUNCTION public.next_invoice_number_for_dealer(_dealer_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pfx text; max_n int;
BEGIN
  SELECT invoice_prefix INTO pfx FROM public.dealers WHERE id = _dealer_id;
  IF pfx IS NULL THEN RAISE EXCEPTION 'Dealer not found'; END IF;
  SELECT COALESCE(MAX(NULLIF(regexp_replace(substring(invoice_number from length(pfx)+1), '\D', '', 'g'), '')::int), 0)
    INTO max_n
  FROM public.invoices
  WHERE dealer_id = _dealer_id AND invoice_number LIKE pfx || '%';
  RETURN pfx || lpad((max_n + 1)::text, 3, '0');
END; $$;
```

## Out of scope this turn

Dealer ledger view, overdue notifications, Business Settings page (logo/signature/bank/UPI QR), Excel report shape changes, edit/duplicate invoice, and server-side DOCX→PDF conversion (client jsPDF stays; true DOCX-fidelity PDF needs LibreOffice which isn't available in the Worker runtime — flagged as next-turn work if you want it).
