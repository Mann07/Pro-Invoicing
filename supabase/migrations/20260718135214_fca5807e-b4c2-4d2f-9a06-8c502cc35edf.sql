
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
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pfx text;
  max_n int;
BEGIN
  SELECT invoice_prefix INTO pfx FROM public.dealers WHERE id = _dealer_id;
  IF pfx IS NULL THEN
    RAISE EXCEPTION 'Dealer not found';
  END IF;
  SELECT COALESCE(
    MAX(
      NULLIF(
        regexp_replace(substring(invoice_number from length(pfx) + 1), '\D', '', 'g'),
        ''
      )::int
    ),
    0
  )
  INTO max_n
  FROM public.invoices
  WHERE dealer_id = _dealer_id
    AND invoice_number LIKE pfx || '%';
  RETURN pfx || lpad((max_n + 1)::text, 3, '0');
END;
$$;
