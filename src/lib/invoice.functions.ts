import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const LineItemSchema = z.object({
  description: z.string(),
  qty: z.number(),
  rate: z.number(),
  amount: z.number(),
});

const InvoiceInput = z.object({
  dealer_id: z.string().uuid().nullable().optional(),
  customer_id: z.string().uuid().nullable().optional(),
  issue_date: z.string(),
  line_items: z.array(LineItemSchema),
  gst_rate: z.number().min(0).max(100),
  notes: z.string().optional().nullable(),
});

/**
 * Create an invoice: assigns next invoice number, calculates totals,
 * renders the active Word template into a .docx, stores it, and inserts the row.
 */
export const createInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => InvoiceInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const subtotal = data.line_items.reduce((s, it) => s + Number(it.amount || 0), 0);
    const gst_amount = +(subtotal * (data.gst_rate / 100)).toFixed(2);
    const total = +(subtotal + gst_amount).toFixed(2);

    const { data: numberRes, error: numErr } = await supabase.rpc("next_invoice_number");
    if (numErr) throw new Error(numErr.message);
    const invoice_number = numberRes as string;

    // Fetch dealer + customer for template rendering
    const [{ data: dealer }, { data: customer }, { data: tpl }] = await Promise.all([
      data.dealer_id ? supabase.from("dealers").select("*").eq("id", data.dealer_id).maybeSingle() : Promise.resolve({ data: null }),
      data.customer_id ? supabase.from("customers").select("*").eq("id", data.customer_id).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from("invoice_templates").select("*").eq("is_active", true).maybeSingle(),
    ]);

    let docx_path: string | null = null;
    let template_id: string | null = tpl?.id ?? null;

    if (tpl) {
      // Download template
      const { data: file, error: dlErr } = await supabase.storage
        .from("invoice-templates")
        .download(tpl.storage_path);
      if (dlErr) throw new Error(`Template download failed: ${dlErr.message}`);
      const arrayBuf = await file.arrayBuffer();

      // Render using docxtemplater (dynamic import - server only)
      const PizZip = (await import("pizzip")).default;
      const Docxtemplater = (await import("docxtemplater")).default;

      const zip = new PizZip(arrayBuf);
      const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

      const templateData = {
        invoice_number,
        issue_date: data.issue_date,
        dealer_name: dealer?.name ?? "",
        dealer_address: dealer?.address ?? "",
        dealer_gstin: dealer?.gstin ?? "",
        dealer_phone: dealer?.phone ?? "",
        dealer_email: dealer?.email ?? "",
        customer_name: customer?.name ?? "",
        customer_address: customer?.address ?? "",
        customer_phone: customer?.phone ?? "",
        vehicle_reg: customer?.vehicle_reg ?? "",
        vehicle_make_model: customer?.vehicle_make_model ?? "",
        items: data.line_items.map((it, i) => ({
          sr: i + 1,
          description: it.description,
          qty: it.qty,
          rate: it.rate.toFixed(2),
          amount: it.amount.toFixed(2),
        })),
        subtotal: subtotal.toFixed(2),
        gst_rate: data.gst_rate.toFixed(2),
        gst_amount: gst_amount.toFixed(2),
        total: total.toFixed(2),
        notes: data.notes ?? "",
      };

      try {
        doc.render(templateData);
      } catch (e: any) {
        throw new Error(`Template render failed: ${e?.message ?? "check placeholders"}`);
      }

      const rendered = doc.getZip().generate({ type: "uint8array" });
      docx_path = `${userId}/${invoice_number}.docx`;
      const { error: upErr } = await supabase.storage
        .from("invoices")
        .upload(docx_path, rendered, {
          contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          upsert: true,
        });
      if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
    }

    const { data: inserted, error: insErr } = await supabase
      .from("invoices")
      .insert({
        invoice_number,
        dealer_id: data.dealer_id ?? null,
        customer_id: data.customer_id ?? null,
        issue_date: data.issue_date,
        line_items: data.line_items,
        subtotal,
        gst_rate: data.gst_rate,
        gst_amount,
        total,
        notes: data.notes ?? null,
        docx_path,
        template_id,
        created_by: userId,
      })
      .select("id, invoice_number")
      .single();
    if (insErr) throw new Error(insErr.message);

    return inserted;
  });

/** Get a signed download URL for an invoice DOCX. */
export const getInvoiceDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ path: z.string() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: signed, error } = await context.supabase.storage
      .from("invoices")
      .createSignedUrl(data.path, 60 * 10);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl };
  });
