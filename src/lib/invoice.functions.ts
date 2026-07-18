import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { toIndianWordsINR } from "@/lib/format";

const LineItemSchema = z.object({
  description: z.string(),
  hsn_sac: z.string().optional().nullable(),
  qty: z.number(),
  rate: z.number(),
  amount: z.number(),
});

const InvoiceInput = z.object({
  bill_type: z.enum(["dealer", "vendor"]).default("dealer"),
  dealer_id: z.string().uuid().nullable().optional(),
  customer_id: z.string().uuid().nullable().optional(),
  invoice_number: z.string().optional().nullable(),
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

    // Determine invoice number: user-provided (validated) or dealer-scoped RPC.
    let invoice_number: string;
    if (data.invoice_number && data.invoice_number.trim()) {
      invoice_number = data.invoice_number.trim();
    } else if (data.dealer_id) {
      const { data: numberRes, error: numErr } = await supabase
        .rpc("next_invoice_number_for_dealer", { _dealer_id: data.dealer_id });
      if (numErr) throw new Error(numErr.message);
      invoice_number = numberRes as string;
    } else {
      const { data: numberRes, error: numErr } = await supabase.rpc("next_invoice_number");
      if (numErr) throw new Error(numErr.message);
      invoice_number = numberRes as string;
    }

    // Fetch dealer + customer for template rendering
    const [{ data: dealer }, { data: customer }, { data: tpl }] = await Promise.all([
      data.dealer_id ? supabase.from("dealers").select("*").eq("id", data.dealer_id).maybeSingle() : Promise.resolve({ data: null }),
      data.customer_id ? supabase.from("customers").select("*").eq("id", data.customer_id).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from("invoice_templates").select("*").eq("is_active", true).maybeSingle(),
    ]);

    const amount_in_words = toIndianWordsINR(total);

    let docx_path: string | null = null;
    const template_id: string | null = tpl?.id ?? null;

    if (tpl) {
      const { data: file, error: dlErr } = await supabase.storage
        .from("invoice-templates")
        .download(tpl.storage_path);
      if (dlErr) throw new Error(`Template download failed: ${dlErr.message}`);
      const arrayBuf = await file.arrayBuffer();

      const PizZip = (await import("pizzip")).default;
      const Docxtemplater = (await import("docxtemplater")).default;

      const zip = new PizZip(arrayBuf);
      const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

      const templateData = {
        bill_type: data.bill_type,
        is_dealer_bill: data.bill_type === "dealer",
        is_vendor_bill: data.bill_type === "vendor",
        invoice_number,
        issue_date: data.issue_date,
        dealer_name: (dealer?.invoice_name || dealer?.name) ?? "",
        dealer_address: dealer?.address ?? "",
        dealer_gstin: dealer?.gstin ?? "",
        dealer_phone: dealer?.phone ?? "",
        dealer_email: dealer?.email ?? "",
        dealer_contact: dealer?.contact_person ?? "",
        vendor_name: customer?.name ?? "",
        vendor_address: customer?.address ?? "",
        vendor_phone: customer?.phone ?? "",
        // Legacy aliases for existing templates
        customer_name: customer?.name ?? "",
        customer_address: customer?.address ?? "",
        customer_phone: customer?.phone ?? "",
        vehicle_reg: customer?.vehicle_reg ?? "",
        vehicle_make_model: customer?.vehicle_make_model ?? "",
        items: data.line_items.map((it, i) => ({
          sr: i + 1,
          description: it.description,
          hsn_sac: it.hsn_sac ?? "",
          qty: it.qty,
          rate: it.rate.toFixed(2),
          amount: it.amount.toFixed(2),
        })),
        subtotal: subtotal.toFixed(2),
        gst_rate: data.gst_rate.toFixed(2),
        gst_amount: gst_amount.toFixed(2),
        total: total.toFixed(2),
        amount_in_words,
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

/** Preview the next dealer-scoped invoice number without consuming it. */
export const previewNextInvoiceNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ dealer_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: num, error } = await context.supabase
      .rpc("next_invoice_number_for_dealer", { _dealer_id: data.dealer_id });
    if (error) throw new Error(error.message);
    return { invoice_number: num as string };
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
