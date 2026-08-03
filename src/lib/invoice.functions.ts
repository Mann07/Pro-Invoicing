import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { toIndianWordsINR } from "@/lib/format";

/* ------------------------------------------------------------------ */
/* Schemas                                                             */
/* ------------------------------------------------------------------ */

const ModuleEnum = z.enum(["dealer", "vendor", "transporter", "customer"]);

const LineItemSchema = z.object({
  description: z.string(),
  hsn_sac: z.string().optional().nullable(),
  qty: z.number(),
  rate: z.number(),
  amount: z.number(),
});

const CustomerInfo = z.object({
  name: z.string().min(1),
  address: z.string().optional().nullable(),
  gstin: z.string().optional().nullable(),
  mobile: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
});

const CreateInvoiceInput = z.object({
  module: ModuleEnum,
  party_id: z.string().uuid().nullable().optional(),
  customer: CustomerInfo.nullable().optional(),
  invoice_number: z.string().optional().nullable(),
  issue_date: z.string(),
  line_items: z.array(LineItemSchema),
  gst_rate: z.number().min(0).max(100),
  tds_rate: z.number().min(0).max(100).optional(),
  notes: z.string().optional().nullable(),
  template_id: z.string().uuid().nullable().optional(),
});

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function safe(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

async function renderDocx(templateBuffer: ArrayBuffer, data: Record<string, unknown>): Promise<Uint8Array> {
  const PizZip = (await import("pizzip")).default;
  const Docxtemplater = (await import("docxtemplater")).default;
  const zip = new PizZip(templateBuffer);
  // nullGetter returns "" so undefined placeholders don't print "undefined".
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => "",
  });
  doc.render(data);
  return doc.getZip().generate({ type: "uint8array" });
}

/* ------------------------------------------------------------------ */
/* Create invoice                                                      */
/* ------------------------------------------------------------------ */

export const createInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => CreateInvoiceInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const sb = supabase as any;

    const subtotal = +data.line_items.reduce((s, it) => s + Number(it.amount || 0), 0).toFixed(2);
    const gst_amount = +(subtotal * (data.gst_rate / 100)).toFixed(2);
    const total = +(subtotal + gst_amount).toFixed(2);
    // TDS is deducted by the payer on the subtotal (before GST); it does not change the invoice value.
    const tds_rate = Number(data.tds_rate ?? 0);
    const tds_amount = +(subtotal * (tds_rate / 100)).toFixed(2);
    const expected_payment = +(total - tds_amount).toFixed(2);

    // Load party master (if applicable) and module prefix + template
    let party: any = null;
    let modulePrefix = "";
    if (data.module === "dealer") {
      if (!data.party_id) throw new Error("Dealer required");
      const { data: d } = await sb.from("dealers").select("*").eq("id", data.party_id).maybeSingle();
      if (!d) throw new Error("Dealer not found");
      party = d;
      modulePrefix = d.invoice_prefix;
    } else if (data.module === "vendor") {
      if (!data.party_id) throw new Error("Vendor required");
      const { data: v } = await sb.from("vendors").select("*").eq("id", data.party_id).maybeSingle();
      if (!v) throw new Error("Vendor not found");
      party = v;
      modulePrefix = v.invoice_prefix;
    } else if (data.module === "transporter") {
      if (!data.party_id) throw new Error("Transporter required");
      const { data: t } = await sb.from("transporters").select("*").eq("id", data.party_id).maybeSingle();
      if (!t) throw new Error("Transporter not found");
      party = t;
      modulePrefix = t.invoice_prefix;
    } else {
      if (!data.customer?.name) throw new Error("Customer name required");
      const { data: s } = await sb.from("module_settings").select("invoice_prefix").eq("module", "customer").maybeSingle();
      modulePrefix = s?.invoice_prefix ?? "CUS-";
    }

    // Determine next sequence & invoice number
    const dealerScope = data.module === "dealer" ? data.party_id! : null;
    const { data: seqRes, error: seqErr } = await sb.rpc("next_invoice_seq", {
      _module: data.module,
      _dealer_id: dealerScope,
    });
    if (seqErr) throw new Error(seqErr.message);
    let seq = Number(seqRes);
    const manual = data.invoice_number?.trim() || "";
    const invoice_number = manual || `${modulePrefix}${String(seq).padStart(4, "0")}`;

    if (manual) {
      // Uniqueness (global — invoice numbers are user-visible identifiers)
      const { data: dupe } = await sb
        .from("invoices")
        .select("id")
        .eq("invoice_number", manual)
        .maybeSingle();
      if (dupe) throw new Error(`Invoice number ${manual} already exists`);
      // Keep future numbering ahead of any manually entered higher number
      const digits = manual.match(/(\d+)\s*$/);
      if (digits) {
        const n = Number(digits[1]);
        if (Number.isFinite(n) && n >= seq) seq = n;
      }
    }


    // Template — user-picked, or fall back to party default, or any active for module
    let templateId: string | null = data.template_id ?? party?.default_template_id ?? null;
    if (!templateId) {
      const { data: tpl } = await sb
        .from("invoice_templates")
        .select("id")
        .eq("module", data.module)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      templateId = tpl?.id ?? null;
    }

    let docx_path: string | null = null;
    let pdf_path: string | null = null;
    let template_version: number | null = null;

    if (templateId) {
      const { data: tpl, error: tplErr } = await sb
        .from("invoice_templates")
        .select("*")
        .eq("id", templateId)
        .maybeSingle();
      if (tplErr) throw new Error(tplErr.message);
      if (!tpl) throw new Error("Template not found");
      template_version = 1; // stored path is immutable per template row

      const { data: file, error: dlErr } = await sb.storage.from("invoice-templates").download(tpl.storage_path);
      if (dlErr) throw new Error(`Template download failed: ${dlErr.message}`);
      const arrayBuf = await file.arrayBuffer();

      const templateData = {
        module: data.module,
        is_dealer: data.module === "dealer",
        is_vendor: data.module === "vendor",
        is_transporter: data.module === "transporter",
        is_customer: data.module === "customer",
        invoice_number,
        issue_date: data.issue_date,
        // Party (dealer/vendor/transporter) mapping
        party_name: safe(party?.name),
        party_nickname: safe(party?.nickname),
        party_gstin: safe(party?.gstin),
        party_address: safe(party?.address),
        party_contact: safe(party?.contact_person),
        party_mobile: safe(party?.mobile),
        party_email: safe(party?.email),
        // Backward-compatible dealer_* aliases
        dealer_name: safe(party?.name),
        dealer_gstin: safe(party?.gstin),
        dealer_address: safe(party?.address),
        dealer_phone: safe(party?.mobile),
        dealer_email: safe(party?.email),
        dealer_contact: safe(party?.contact_person),
        // One-off customer fields
        customer_name: safe(data.customer?.name),
        customer_address: safe(data.customer?.address),
        customer_gstin: safe(data.customer?.gstin),
        customer_mobile: safe(data.customer?.mobile),
        customer_email: safe(data.customer?.email),
        items: data.line_items.map((it, i) => ({
          sr: i + 1,
          description: safe(it.description),
          hsn_sac: safe(it.hsn_sac),
          qty: it.qty,
          rate: it.rate.toFixed(2),
          amount: it.amount.toFixed(2),
        })),
        subtotal: subtotal.toFixed(2),
        gst_rate: data.gst_rate.toFixed(2),
        gst_amount: gst_amount.toFixed(2),
        total: total.toFixed(2),
        tds_rate: tds_rate.toFixed(2),
        tds_amount: tds_amount.toFixed(2),
        expected_payment: expected_payment.toFixed(2),
        amount_in_words: toIndianWordsINR(total),
        notes: safe(data.notes),
      };

      const rendered = await renderDocx(arrayBuf, templateData).catch((e: any) => {
        throw new Error(`Template render failed: ${e?.message ?? "check placeholders"}`);
      });

      docx_path = `${userId}/${data.module}/${invoice_number}.docx`;
      const { error: upErr } = await sb.storage
        .from("invoices")
        .upload(docx_path, rendered, {
          contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          upsert: true,
        });
      if (upErr) throw new Error(`DOCX upload failed: ${upErr.message}`);

    }

    // PDF is generated on demand (first "Download PDF" click), not at creation time.
    const pdf_status: "pending" | "ready" | "failed" = "pending";
    const pdf_error: string | null = null;
    const pdf_generated_at: string | null = null;
    pdf_path = null;


    const insertRow: any = {
      module: data.module,
      dealer_id: data.module === "dealer" ? data.party_id : null,
      vendor_id: data.module === "vendor" ? data.party_id : null,
      transporter_id: data.module === "transporter" ? data.party_id : null,
      customer_name: data.module === "customer" ? data.customer?.name ?? null : null,
      customer_address: data.module === "customer" ? data.customer?.address ?? null : null,
      customer_gstin: data.module === "customer" ? data.customer?.gstin ?? null : null,
      customer_mobile: data.module === "customer" ? data.customer?.mobile ?? null : null,
      customer_email: data.module === "customer" ? data.customer?.email ?? null : null,
      invoice_number,
      invoice_seq: seq,
      issue_date: data.issue_date,
      line_items: data.line_items,
      subtotal,
      gst_rate: data.gst_rate,
      gst_amount,
      tds_rate,
      tds_amount,
      total,
      notes: data.notes ?? null,
      status: "pending",
      docx_path,
      pdf_path,
      pdf_status,
      pdf_generated_at,
      pdf_error,
      template_id: templateId,
      template_version,
      created_by: userId,
    };

    const { data: inserted, error: insErr } = await sb
      .from("invoices")
      .insert(insertRow)
      .select("id, invoice_number, module")
      .single();
    if (insErr) throw new Error(insErr.message);
    return inserted;
  });

/* ------------------------------------------------------------------ */
/* Signed download URLs                                                */
/* ------------------------------------------------------------------ */

export const getInvoiceDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ path: z.string() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: signed, error } = await (context.supabase as any).storage
      .from("invoices")
      .createSignedUrl(data.path, 60 * 10);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl };
  });

/* ------------------------------------------------------------------ */
/* Payments — record + auto-update status                              */
/* ------------------------------------------------------------------ */

export const addPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({
      invoice_id: z.string().uuid(),
      amount: z.number().positive(),
      paid_on: z.string(),
      notes: z.string().optional().nullable(),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: inv, error: iErr } = await sb.from("invoices").select("*").eq("id", data.invoice_id).maybeSingle();
    if (iErr) throw new Error(iErr.message);
    if (!inv) throw new Error("Invoice not found");
    if (inv.status === "cancelled") throw new Error("Cannot add payment to a cancelled invoice");
    if (inv.status === "paid") throw new Error("Invoice is already paid and locked");

    const { error: payErr } = await sb.from("invoice_payments").insert({
      invoice_id: data.invoice_id,
      amount: data.amount,
      paid_on: data.paid_on,
      notes: data.notes ?? null,
      created_by: context.userId,
    });
    if (payErr) throw new Error(payErr.message);

    const newPaid = Number(inv.amount_paid) + Number(data.amount);
    const total = Number(inv.total);
    // Dealers deduct TDS on the subtotal; the expected receipt is total − TDS.
    const tdsAmount = Number(inv.tds_amount ?? 0);
    const expected = +(total - tdsAmount).toFixed(2);
    let nextStatus: "pending" | "partial" | "paid" = "pending";
    if (newPaid + 0.01 >= expected) nextStatus = "paid";
    else if (newPaid > 0) nextStatus = "partial";

    const patch: any = { amount_paid: newPaid, status: nextStatus };
    if (nextStatus === "paid") patch.finalized_at = new Date().toISOString();

    const { error: uErr } = await sb.from("invoices").update(patch).eq("id", data.invoice_id);
    if (uErr) throw new Error(uErr.message);
    return { ok: true, status: nextStatus, amount_paid: newPaid };
  });

/* ------------------------------------------------------------------ */
/* Cancel invoice (reserves the number)                                */
/* ------------------------------------------------------------------ */

export const cancelInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ invoice_id: z.string().uuid(), reason: z.string().optional().nullable() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { error } = await sb
      .from("invoices")
      .update({ status: "cancelled", cancelled_reason: data.reason ?? null })
      .eq("id", data.invoice_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* Missing-number detection                                            */
/* ------------------------------------------------------------------ */

export const listMissingSeqs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      module: ModuleEnum,
      dealer_id: z.string().uuid().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: rows, error } = await sb.rpc("missing_invoice_seqs", {
      _module: data.module,
      _dealer_id: data.dealer_id ?? null,
    });
    if (error) throw new Error(error.message);
    return { missing: ((rows ?? []) as Array<{ missing_seq: number }>).map((r) => r.missing_seq) };
  });

/* ------------------------------------------------------------------ */
/* Regenerate PDF from stored DOCX (for retry after failed conversion) */
/* ------------------------------------------------------------------ */

export const regeneratePdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ invoice_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = (context.supabase as any);
    const { data: inv, error } = await sb.from("invoices").select("*").eq("id", data.invoice_id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!inv) throw new Error("Invoice not found");
    if (!inv.docx_path) throw new Error("No DOCX on file — cannot generate PDF");
    if (inv.pdf_status === "processing") throw new Error("PDF conversion already in progress");

    await sb.from("invoices").update({ pdf_status: "processing", pdf_error: null }).eq("id", data.invoice_id);

    try {
      const { convertDocxToPdf } = await import("@/lib/pdf-conversion.server");
      const { data: dl, error: dErr } = await sb.storage.from("invoices").download(inv.docx_path);
      if (dErr) throw new Error(dErr.message);
      const bytes = new Uint8Array(await dl.arrayBuffer());
      const pdf = await convertDocxToPdf(bytes, `${inv.invoice_number}.docx`);
      const pdf_path = `${inv.created_by}/${inv.module}/${inv.invoice_number}.pdf`;
      const { error: upErr } = await sb.storage.from("invoices").upload(pdf_path, pdf, {
        contentType: "application/pdf",
        upsert: true,
      });
      if (upErr) throw new Error(upErr.message);
      await sb.from("invoices").update({
        pdf_path,
        pdf_status: "ready",
        pdf_generated_at: new Date().toISOString(),
        pdf_error: null,
      }).eq("id", data.invoice_id);
      return { ok: true };
    } catch (e: any) {
      await sb.from("invoices").update({
        pdf_status: "failed",
        pdf_error: e?.message ?? String(e),
      }).eq("id", data.invoice_id);
      throw new Error(e?.message ?? "PDF conversion failed");
    }
  });

/* ------------------------------------------------------------------ */
/* Next invoice number preview (per module / dealer)                   */
/* ------------------------------------------------------------------ */

export const getNextInvoiceNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      module: ModuleEnum,
      party_id: z.string().uuid().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;

    let prefix = "";
    if (data.module === "customer") {
      const { data: s } = await sb.from("module_settings").select("invoice_prefix").eq("module", "customer").maybeSingle();
      prefix = s?.invoice_prefix ?? "CUS-";
    } else {
      if (!data.party_id) return { prefix: "", seq: null as number | null, invoice_number: "" };
      const table = data.module === "dealer" ? "dealers" : data.module === "vendor" ? "vendors" : "transporters";
      const { data: p } = await sb.from(table).select("invoice_prefix").eq("id", data.party_id).maybeSingle();
      if (!p) throw new Error("Party not found");
      prefix = p.invoice_prefix;
    }

    const { data: seqRes, error } = await sb.rpc("next_invoice_seq", {
      _module: data.module,
      _dealer_id: data.module === "dealer" ? data.party_id : null,
    });
    if (error) throw new Error(error.message);
    const seq = Number(seqRes);
    return { prefix, seq, invoice_number: `${prefix}${String(seq).padStart(4, "0")}` };
  });

/* ------------------------------------------------------------------ */
/* On-demand PDF: reuse existing, otherwise convert stored DOCX        */
/* ------------------------------------------------------------------ */

export const ensureInvoicePdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ invoice_id: z.string().uuid(), force: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: inv, error } = await sb.from("invoices").select("*").eq("id", data.invoice_id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!inv) throw new Error("Invoice not found");

    const signed = async (path: string) => {
      const { data: s, error: sErr } = await sb.storage.from("invoices").createSignedUrl(path, 60 * 10);
      if (sErr) throw new Error(sErr.message);
      return s.signedUrl as string;
    };

    // Reuse an existing, up-to-date PDF
    if (!data.force && inv.pdf_status === "ready" && inv.pdf_path) {
      return { url: await signed(inv.pdf_path), reused: true };
    }
    if (!inv.docx_path) throw new Error("No DOCX on file — cannot generate PDF");

    await sb.from("invoices").update({ pdf_status: "processing", pdf_error: null }).eq("id", inv.id);
    try {
      const { convertDocxToPdf } = await import("@/lib/pdf-conversion.server");
      const { data: dl, error: dErr } = await sb.storage.from("invoices").download(inv.docx_path);
      if (dErr) throw new Error(dErr.message);
      const bytes = new Uint8Array(await dl.arrayBuffer());
      const pdf = await convertDocxToPdf(bytes, `${inv.invoice_number}.docx`);
      const pdf_path = `${inv.created_by}/${inv.module}/${inv.invoice_number}.pdf`;
      const { error: upErr } = await sb.storage.from("invoices").upload(pdf_path, pdf, {
        contentType: "application/pdf",
        upsert: true,
      });
      if (upErr) throw new Error(upErr.message);
      await sb.from("invoices").update({
        pdf_path,
        pdf_status: "ready",
        pdf_generated_at: new Date().toISOString(),
        pdf_error: null,
      }).eq("id", inv.id);
      return { url: await signed(pdf_path), reused: false };
    } catch (e: any) {
      await sb.from("invoices").update({
        pdf_status: "failed",
        pdf_error: e?.message ?? String(e),
      }).eq("id", inv.id);
      throw new Error(e?.message ?? "PDF conversion failed");
    }
  });

/* ------------------------------------------------------------------ */
/* Invalidate a stored PDF (call after an invoice is modified)         */
/* ------------------------------------------------------------------ */

export const invalidateInvoicePdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ invoice_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: inv } = await sb.from("invoices").select("pdf_path").eq("id", data.invoice_id).maybeSingle();
    if (inv?.pdf_path) { try { await sb.storage.from("invoices").remove([inv.pdf_path]); } catch { /* ignore */ } }
    const { error } = await sb.from("invoices").update({
      pdf_path: null,
      pdf_status: "pending",
      pdf_generated_at: null,
      pdf_error: null,
    }).eq("id", data.invoice_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* Permanent delete (row + payments + stored documents)                */
/* ------------------------------------------------------------------ */

export const deleteInvoicePermanently = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ invoice_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: inv } = await sb
      .from("invoices")
      .select("id, docx_path, pdf_path")
      .eq("id", data.invoice_id)
      .maybeSingle();
    if (!inv) return { ok: true };

    const paths = [inv.docx_path, inv.pdf_path].filter(Boolean) as string[];
    if (paths.length) { try { await sb.storage.from("invoices").remove(paths); } catch { /* ignore */ } }

    const { error: pErr } = await sb.from("invoice_payments").delete().eq("invoice_id", inv.id);
    if (pErr) throw new Error(pErr.message);

    const { error } = await sb.from("invoices").delete().eq("id", inv.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
