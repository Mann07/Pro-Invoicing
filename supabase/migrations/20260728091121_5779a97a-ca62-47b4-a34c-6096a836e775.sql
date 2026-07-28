
DO $$ BEGIN
  CREATE TYPE public.pdf_status AS ENUM ('pending','processing','ready','failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS pdf_status public.pdf_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS pdf_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS pdf_error text;

UPDATE public.invoices SET pdf_status = 'ready' WHERE pdf_path IS NOT NULL AND pdf_status = 'pending';
