
CREATE POLICY "storage templates read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'invoice-templates');
CREATE POLICY "storage templates admin write" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'invoice-templates' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'invoice-templates' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "storage invoices read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'invoices');
CREATE POLICY "storage invoices write" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'invoices') WITH CHECK (bucket_id = 'invoices');
