
ALTER FUNCTION public.next_invoice_seq(public.invoice_module, uuid) SECURITY INVOKER;
ALTER FUNCTION public.missing_invoice_seqs(public.invoice_module, uuid) SECURITY INVOKER;
REVOKE EXECUTE ON FUNCTION public.next_invoice_seq(public.invoice_module, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.missing_invoice_seqs(public.invoice_module, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_invoice_seq(public.invoice_module, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.missing_invoice_seqs(public.invoice_module, uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
