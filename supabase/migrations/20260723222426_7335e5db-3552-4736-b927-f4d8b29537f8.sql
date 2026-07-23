
-- === WIPE ===
DROP FUNCTION IF EXISTS public.next_invoice_number() CASCADE;
DROP FUNCTION IF EXISTS public.next_invoice_number_for_dealer(uuid) CASCADE;
DROP TABLE IF EXISTS public.invoices CASCADE;
DROP TABLE IF EXISTS public.invoice_counters CASCADE;
DROP TABLE IF EXISTS public.invoice_templates CASCADE;
DROP TABLE IF EXISTS public.customers CASCADE;
DROP TABLE IF EXISTS public.dealers CASCADE;
DROP TYPE IF EXISTS public.payment_status CASCADE;

-- === ENUMS ===
CREATE TYPE public.invoice_module AS ENUM ('dealer','vendor','transporter','customer');
CREATE TYPE public.invoice_status AS ENUM ('draft','pending','partial','paid','cancelled');
CREATE TYPE public.template_status AS ENUM ('active','archived');

-- === PARTY MASTERS ===
-- Shared shape for dealers/vendors/transporters
-- (columns intentionally duplicated across three tables to keep modules independent)

CREATE TABLE public.dealers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  nickname text,
  invoice_prefix text NOT NULL,
  gstin text,
  address text,
  contact_person text,
  mobile text,
  email text,
  notes text,
  default_template_id uuid,
  default_gst_rate numeric(5,2),
  default_hsn_sac text,
  default_description text,
  default_rate numeric(12,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invoice_prefix)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dealers TO authenticated;
GRANT ALL ON public.dealers TO service_role;
ALTER TABLE public.dealers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dealers admin all" ON public.dealers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  nickname text,
  invoice_prefix text NOT NULL,
  gstin text,
  address text,
  contact_person text,
  mobile text,
  email text,
  notes text,
  default_template_id uuid,
  default_gst_rate numeric(5,2),
  default_hsn_sac text,
  default_description text,
  default_rate numeric(12,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invoice_prefix)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendors TO authenticated;
GRANT ALL ON public.vendors TO service_role;
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vendors admin all" ON public.vendors FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.transporters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  nickname text,
  invoice_prefix text NOT NULL,
  gstin text,
  address text,
  contact_person text,
  mobile text,
  email text,
  notes text,
  default_template_id uuid,
  default_gst_rate numeric(5,2),
  default_hsn_sac text,
  default_description text,
  default_rate numeric(12,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invoice_prefix)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transporters TO authenticated;
GRANT ALL ON public.transporters TO service_role;
ALTER TABLE public.transporters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "transporters admin all" ON public.transporters FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- === TEMPLATES (per module) ===
CREATE TABLE public.invoice_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  module public.invoice_module NOT NULL,
  storage_path text NOT NULL,
  status public.template_status NOT NULL DEFAULT 'active',
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_templates TO authenticated;
GRANT ALL ON public.invoice_templates TO service_role;
ALTER TABLE public.invoice_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "templates admin all" ON public.invoice_templates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

ALTER TABLE public.dealers      ADD CONSTRAINT dealers_default_template_fk      FOREIGN KEY (default_template_id) REFERENCES public.invoice_templates(id) ON DELETE SET NULL;
ALTER TABLE public.vendors      ADD CONSTRAINT vendors_default_template_fk      FOREIGN KEY (default_template_id) REFERENCES public.invoice_templates(id) ON DELETE SET NULL;
ALTER TABLE public.transporters ADD CONSTRAINT transporters_default_template_fk FOREIGN KEY (default_template_id) REFERENCES public.invoice_templates(id) ON DELETE SET NULL;

-- === MODULE-LEVEL SETTINGS (prefixes for non-dealer modules) ===
CREATE TABLE public.module_settings (
  module public.invoice_module PRIMARY KEY,
  invoice_prefix text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.module_settings TO authenticated;
GRANT ALL ON public.module_settings TO service_role;
ALTER TABLE public.module_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "module_settings admin all" ON public.module_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
INSERT INTO public.module_settings(module, invoice_prefix) VALUES
  ('vendor','VEN-'),('transporter','TRN-'),('customer','CUS-');

-- === INVOICES ===
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module public.invoice_module NOT NULL,
  -- party links (exactly one set based on module; customer has none)
  dealer_id uuid REFERENCES public.dealers(id) ON DELETE RESTRICT,
  vendor_id uuid REFERENCES public.vendors(id) ON DELETE RESTRICT,
  transporter_id uuid REFERENCES public.transporters(id) ON DELETE RESTRICT,
  -- one-off customer fields
  customer_name text,
  customer_address text,
  customer_gstin text,
  customer_mobile text,
  customer_email text,
  -- numbering
  invoice_number text NOT NULL,
  invoice_seq integer NOT NULL,
  -- content
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  gst_rate numeric(5,2) NOT NULL DEFAULT 0,
  gst_amount numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  notes text,
  -- status
  status public.invoice_status NOT NULL DEFAULT 'draft',
  amount_paid numeric(14,2) NOT NULL DEFAULT 0,
  cancelled_reason text,
  -- documents
  template_id uuid REFERENCES public.invoice_templates(id) ON DELETE SET NULL,
  template_version integer,
  docx_path text,
  pdf_path text,
  finalized_at timestamptz,
  -- audit
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (module, invoice_number)
);
CREATE INDEX invoices_module_idx ON public.invoices(module);
CREATE INDEX invoices_dealer_idx ON public.invoices(dealer_id) WHERE dealer_id IS NOT NULL;
CREATE INDEX invoices_vendor_idx ON public.invoices(vendor_id) WHERE vendor_id IS NOT NULL;
CREATE INDEX invoices_transporter_idx ON public.invoices(transporter_id) WHERE transporter_id IS NOT NULL;
CREATE INDEX invoices_status_idx ON public.invoices(status);
CREATE INDEX invoices_issue_date_idx ON public.invoices(issue_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invoices admin all" ON public.invoices FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- === PAYMENTS ===
CREATE TABLE public.invoice_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  paid_on date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX invoice_payments_invoice_idx ON public.invoice_payments(invoice_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_payments TO authenticated;
GRANT ALL ON public.invoice_payments TO service_role;
ALTER TABLE public.invoice_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payments admin all" ON public.invoice_payments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- === TRIGGERS ===
CREATE TRIGGER dealers_updated_at      BEFORE UPDATE ON public.dealers      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER vendors_updated_at      BEFORE UPDATE ON public.vendors      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER transporters_updated_at BEFORE UPDATE ON public.transporters FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER invoices_updated_at     BEFORE UPDATE ON public.invoices     FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER module_settings_updated_at BEFORE UPDATE ON public.module_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- === HELPERS ===
-- Returns next sequential number for the scope. Scope for dealer = dealer_id, otherwise NULL.
CREATE OR REPLACE FUNCTION public.next_invoice_seq(_module public.invoice_module, _dealer_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE nxt integer;
BEGIN
  IF _module = 'dealer' THEN
    SELECT COALESCE(MAX(invoice_seq),0)+1 INTO nxt FROM public.invoices
      WHERE module='dealer' AND dealer_id = _dealer_id;
  ELSE
    SELECT COALESCE(MAX(invoice_seq),0)+1 INTO nxt FROM public.invoices
      WHERE module = _module;
  END IF;
  RETURN nxt;
END $$;

-- Missing-number gaps for a scope (dealer_id required for dealer module, NULL otherwise)
CREATE OR REPLACE FUNCTION public.missing_invoice_seqs(_module public.invoice_module, _dealer_id uuid)
RETURNS TABLE(missing_seq integer) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH used AS (
    SELECT invoice_seq FROM public.invoices
    WHERE module = _module
      AND ((_module='dealer' AND dealer_id = _dealer_id) OR (_module<>'dealer'))
  ),
  bounds AS (SELECT COALESCE(MAX(invoice_seq),0) AS mx FROM used)
  SELECT gs AS missing_seq
  FROM bounds, generate_series(1, bounds.mx) gs
  WHERE gs NOT IN (SELECT invoice_seq FROM used);
$$;
