ALTER TABLE public.invoice_payments
  ADD COLUMN IF NOT EXISTS tds_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tds_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_mode text,
  ADD COLUMN IF NOT EXISTS utr text;