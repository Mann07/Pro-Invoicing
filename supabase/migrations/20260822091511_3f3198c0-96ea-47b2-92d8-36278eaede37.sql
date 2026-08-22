CREATE OR REPLACE FUNCTION public.next_invoice_seq(_module invoice_module, _dealer_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE nxt integer;
BEGIN
  IF _module = 'dealer' THEN
    SELECT COALESCE(MAX(invoice_seq),0)+1 INTO nxt FROM public.invoices
      WHERE module='dealer' AND dealer_id = _dealer_id;
  ELSIF _module = 'transporter' THEN
    SELECT COALESCE(MAX(invoice_seq),0)+1 INTO nxt FROM public.invoices
      WHERE module='transporter' AND transporter_id = _dealer_id;
  ELSE
    SELECT COALESCE(MAX(invoice_seq),0)+1 INTO nxt FROM public.invoices
      WHERE module = _module;
  END IF;
  RETURN nxt;
END $function$;

CREATE OR REPLACE FUNCTION public.missing_invoice_seqs(_module invoice_module, _dealer_id uuid)
 RETURNS TABLE(missing_seq integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH used AS (
    SELECT invoice_seq FROM public.invoices
    WHERE module = _module
      AND (
        (_module = 'dealer' AND dealer_id = _dealer_id)
        OR (_module = 'transporter' AND transporter_id = _dealer_id)
        OR (_module NOT IN ('dealer','transporter'))
      )
  ),
  bounds AS (SELECT COALESCE(MAX(invoice_seq),0) AS mx FROM used)
  SELECT gs AS missing_seq
  FROM bounds, generate_series(1, bounds.mx) gs
  WHERE gs NOT IN (SELECT invoice_seq FROM used);
$function$;