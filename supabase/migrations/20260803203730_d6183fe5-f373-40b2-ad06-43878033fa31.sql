ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS tds_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tds_amount numeric NOT NULL DEFAULT 0;

ALTER TABLE public.dealers ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.transporters ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;