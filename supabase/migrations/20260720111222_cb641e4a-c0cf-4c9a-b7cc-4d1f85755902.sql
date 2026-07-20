
-- Drop signup trigger (single-admin app)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Tighten RLS on customers, dealers, invoices to admin-only
DROP POLICY IF EXISTS "customers auth all" ON public.customers;
CREATE POLICY "customers admin all" ON public.customers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "dealers auth all" ON public.dealers;
CREATE POLICY "dealers admin all" ON public.dealers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "invoices auth all" ON public.invoices;
CREATE POLICY "invoices admin all" ON public.invoices FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Tighten counters and templates to admin
DROP POLICY IF EXISTS "counter read" ON public.invoice_counters;
CREATE POLICY "counters admin read" ON public.invoice_counters FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "templates auth read" ON public.invoice_templates;
CREATE POLICY "templates admin read" ON public.invoice_templates FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Storage: restrict invoices bucket to admin
DROP POLICY IF EXISTS "invoices auth read" ON storage.objects;
DROP POLICY IF EXISTS "invoices auth write" ON storage.objects;
DROP POLICY IF EXISTS "invoices auth update" ON storage.objects;
DROP POLICY IF EXISTS "invoices auth delete" ON storage.objects;
DROP POLICY IF EXISTS "invoices admin read" ON storage.objects;
DROP POLICY IF EXISTS "invoices admin all" ON storage.objects;

CREATE POLICY "invoices admin all" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'invoices' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'invoices' AND public.has_role(auth.uid(), 'admin'));

-- Revoke SECURITY DEFINER function execution from anon
REVOKE EXECUTE ON FUNCTION public.next_invoice_number() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.next_invoice_number_for_dealer(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_invoice_number() TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_invoice_number_for_dealer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
