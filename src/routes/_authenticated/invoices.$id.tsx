import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, FileText, FileDown, Ban, Lock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { addPayment, cancelInvoice, getInvoiceDownloadUrl, ensureInvoicePdf, deleteInvoicePermanently } from "@/lib/invoice.functions";
import { formatINR, formatDate, todayISO, toIndianWordsINR } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/invoices/$id")({
  component: InvoiceDetail,
});

const statusColors: Record<string, string> = {
  paid: "bg-success text-success-foreground",
  partial: "bg-warning text-warning-foreground",
  pending: "bg-destructive text-destructive-foreground",
  draft: "bg-muted text-muted-foreground",
  cancelled: "bg-muted text-muted-foreground",
};

function InvoiceDetail() {
  const { id } = useParams({ from: "/_authenticated/invoices/$id" });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const dlFn = useServerFn(getInvoiceDownloadUrl);
  const payFn = useServerFn(addPayment);
  const cancelFn = useServerFn(cancelInvoice);
  const pdfFn = useServerFn(ensureInvoicePdf);
  const deleteFn = useServerFn(deleteInvoicePermanently);

  const { data: inv, isLoading } = useQuery({
    queryKey: ["invoice", id],
    queryFn: async () => (await (supabase as any).from("invoices").select("*").eq("id", id).maybeSingle()).data as any,
  });

  // Fetch party + payments in parallel once we know the module
  const { data: party } = useQuery({
    queryKey: ["invoice-party", id, inv?.module, inv?.dealer_id ?? inv?.vendor_id ?? inv?.transporter_id],
    queryFn: async () => {
      if (!inv) return null;
      if (inv.module === "dealer" && inv.dealer_id) return (await (supabase as any).from("dealers").select("*").eq("id", inv.dealer_id).maybeSingle()).data;
      if (inv.module === "vendor" && inv.vendor_id) return (await (supabase as any).from("vendors").select("*").eq("id", inv.vendor_id).maybeSingle()).data;
      if (inv.module === "transporter" && inv.transporter_id) return (await (supabase as any).from("transporters").select("*").eq("id", inv.transporter_id).maybeSingle()).data;
      return null;
    },
    enabled: !!inv && inv.module !== "customer",
  });

  const { data: payments = [] } = useQuery({
    queryKey: ["payments", id],
    queryFn: async () => (await (supabase as any).from("invoice_payments").select("*").eq("invoice_id", id).order("paid_on", { ascending: false })).data ?? [],
    enabled: !!inv,
  });

  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(todayISO());
  const [payNotes, setPayNotes] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [regenBusy, setRegenBusy] = useState(false);

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading…</div>;
  if (!inv) return <div className="p-6">Not found. <Link to="/dashboard" className="text-primary underline">Back</Link></div>;

  const locked = inv.status === "paid" || inv.status === "cancelled";
  const tdsAmount = Number(inv.tds_amount ?? 0);
  const expectedPayment = +(Number(inv.total) - tdsAmount).toFixed(2);
  const outstanding = Math.max(0, expectedPayment - Number(inv.amount_paid));

  async function downloadDocx() {
    if (!inv.docx_path) return toast.error("No DOCX generated (no active template).");
    try {
      const { url } = await dlFn({ data: { path: inv.docx_path } });
      window.open(url, "_blank");
    } catch (e: any) { toast.error(e.message); }
  }
  async function downloadPdf(force = false) {
    if (regenBusy) return;
    if (!inv.docx_path) return toast.error("No DOCX on file — cannot generate PDF.");
    const needsBuild = force || inv.pdf_status !== "ready" || !inv.pdf_path;
    setRegenBusy(true);
    const t = needsBuild ? toast.loading("Converting DOCX to PDF…") : undefined;
    try {
      const { url } = await pdfFn({ data: { invoice_id: id, force } });
      if (t) toast.success("PDF ready", { id: t });
      window.open(url, "_blank");
      qc.invalidateQueries({ queryKey: ["invoice", id] });
    } catch (e: any) {
      toast.error(e.message ?? "PDF conversion failed", { id: t });
    } finally { setRegenBusy(false); }
  }


  async function recordPayment() {
    const amt = Number(amount);
    if (!(amt > 0)) return toast.error("Enter a positive amount");
    setBusy(true);
    try {
      const res = await payFn({ data: { invoice_id: id, amount: amt, paid_on: paidOn, notes: payNotes || null } });
      toast.success(res.status === "paid" ? "Payment complete — invoice finalized and locked" : "Payment recorded");
      setAmount(""); setPayNotes("");
      qc.invalidateQueries({ queryKey: ["invoice", id] });
      qc.invalidateQueries({ queryKey: ["payments", id] });
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  async function cancel() {
    if (!confirm("Cancel this invoice? The number stays reserved.")) return;
    try {
      await cancelFn({ data: { invoice_id: id, reason: cancelReason || null } });
      toast.success("Invoice cancelled");
      qc.invalidateQueries({ queryKey: ["invoice", id] });
    } catch (e: any) { toast.error(e.message); }
  }

  async function deleteInvoice() {
    if (!confirm("Permanently delete this invoice? Its number becomes available again.")) return;
    try {
      await deleteFn({ data: { invoice_id: id } });
      qc.removeQueries({ queryKey: ["invoice", id] });
      await qc.invalidateQueries();
      toast.success("Invoice permanently deleted");
      navigate({ to: "/dashboard" });
    } catch (e: any) {
      toast.error(e?.message ?? "Delete failed");
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/dashboard"><Button size="icon" variant="ghost"><ArrowLeft className="h-4 w-4" /></Button></Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{inv.invoice_number}</h1>
              <Badge className={statusColors[inv.status]}>{inv.status}</Badge>
              {locked && <Badge variant="outline"><Lock className="mr-1 h-3 w-3" /> Locked</Badge>}
              <Badge variant="outline" className="capitalize">{inv.module}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">Issued {formatDate(inv.issue_date)}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={downloadDocx} disabled={!inv.docx_path}><FileText className="mr-2 h-4 w-4" /> DOCX</Button>
          <Button onClick={() => downloadPdf(false)} disabled={regenBusy || !inv.docx_path}>
            {regenBusy
              ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              : <FileDown className="mr-2 h-4 w-4" />}
            Download PDF
          </Button>
          {inv.pdf_status === "ready" && !locked && (
            <Button variant="outline" onClick={() => downloadPdf(true)} disabled={regenBusy}>
              <RefreshCw className={`mr-2 h-4 w-4 ${regenBusy ? "animate-spin" : ""}`} /> Regenerate
            </Button>
          )}

        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <InfoCard title={inv.module === "customer" ? "Customer" : inv.module.charAt(0).toUpperCase() + inv.module.slice(1)}>
          {inv.module === "customer" ? (
            <>
              <div className="font-medium">{inv.customer_name || "—"}</div>
              {inv.customer_gstin && <div className="text-sm text-muted-foreground">GST: {inv.customer_gstin}</div>}
              {inv.customer_address && <div className="text-sm text-muted-foreground">{inv.customer_address}</div>}
              {inv.customer_mobile && <div className="text-sm text-muted-foreground">{inv.customer_mobile}</div>}
              {inv.customer_email && <div className="text-sm text-muted-foreground">{inv.customer_email}</div>}
            </>
          ) : party ? (
            <>
              <div className="font-medium">{party.name}</div>
              {party.gstin && <div className="text-sm text-muted-foreground">GSTIN: {party.gstin}</div>}
              {party.address && <div className="text-sm text-muted-foreground">{party.address}</div>}
              {party.mobile && <div className="text-sm text-muted-foreground">{party.mobile}</div>}
            </>
          ) : <span className="text-sm text-muted-foreground">—</span>}
        </InfoCard>
        <InfoCard title="Documents">
          <div className="text-sm text-muted-foreground">Template version: {inv.template_version ?? "—"}</div>
          <div className="text-sm text-muted-foreground">DOCX: {inv.docx_path ? "stored" : "not generated"}</div>
          <div className="text-sm">
            PDF:{" "}
            <span className={
              inv.pdf_status === "ready" ? "text-success font-medium"
              : inv.pdf_status === "failed" ? "text-destructive font-medium"
              : inv.pdf_status === "processing" ? "text-warning font-medium"
              : "text-muted-foreground"
            }>{inv.pdf_status ?? "pending"}</span>
          </div>
          {inv.pdf_generated_at && <div className="text-sm text-muted-foreground">Converted: {formatDate(inv.pdf_generated_at)}</div>}
          {inv.pdf_error && <div className="mt-1 text-xs text-destructive">Last error: {inv.pdf_error}</div>}
          {inv.finalized_at && <div className="text-sm text-muted-foreground">Finalized: {formatDate(inv.finalized_at)}</div>}
          {inv.cancelled_reason && <div className="text-sm text-muted-foreground">Cancelled: {inv.cancelled_reason}</div>}
        </InfoCard>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Description</th><th className="px-4 py-2">HSN/SAC</th>
              <th className="px-4 py-2 text-right">Qty</th><th className="px-4 py-2 text-right">Rate</th><th className="px-4 py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {(inv.line_items as any[]).map((it, i) => (
              <tr key={i}>
                <td className="px-4 py-2">{it.description}</td>
                <td className="px-4 py-2">{it.hsn_sac || "—"}</td>
                <td className="px-4 py-2 text-right">{it.qty}</td>
                <td className="px-4 py-2 text-right">{formatINR(it.rate)}</td>
                <td className="px-4 py-2 text-right">{formatINR(it.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="border-t p-4">
          <div className="ml-auto max-w-xs space-y-1 text-sm">
            <Row label="Subtotal" value={formatINR(inv.subtotal)} />
            <Row label={`GST @ ${inv.gst_rate}%`} value={formatINR(inv.gst_amount)} />
            <div className="my-1 border-t" />
            <Row label="Invoice total" value={formatINR(inv.total)} bold />
            {tdsAmount > 0 && (
              <>
                <Row label={`TDS @ ${inv.tds_rate}% (on subtotal)`} value={`− ${formatINR(tdsAmount)}`} />
                <Row label="Expected payment" value={formatINR(expectedPayment)} bold />
              </>
            )}
            <Row label="Paid" value={formatINR(inv.amount_paid)} />
            <Row label="Outstanding" value={formatINR(outstanding)} />
          </div>
        </div>
        <div className="border-t p-4 text-sm">
          <span className="font-semibold">Amount in words: </span>
          <span className="italic text-muted-foreground">{toIndianWordsINR(Number(inv.total))}</span>
        </div>
      </div>

      {!locked && (
        <div className="rounded-lg border bg-card p-5">
          <h2 className="font-semibold">Record payment</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <div className="space-y-2"><Label>Amount</Label><Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
            <div className="space-y-2"><Label>Paid on</Label><Input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} /></div>
            <div className="space-y-2 md:col-span-2"><Label>Notes</Label><Input value={payNotes} onChange={(e) => setPayNotes(e.target.value)} /></div>
          </div>
          <div className="mt-3 text-xs text-muted-foreground">Outstanding: {formatINR(outstanding)}. When paid in full the invoice locks automatically.</div>
          <div className="mt-3 flex justify-end"><Button disabled={busy} onClick={recordPayment}>Record payment</Button></div>
        </div>
      )}

      <div className="rounded-lg border bg-card p-5">
        <h2 className="font-semibold">Payment history</h2>
        {(payments as any[]).length === 0 ? <div className="mt-2 text-sm text-muted-foreground">No payments recorded.</div> :
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground"><tr><th>Date</th><th>Amount</th><th>Notes</th></tr></thead>
            <tbody className="divide-y">
              {(payments as any[]).map((p) => (
                <tr key={p.id}><td className="py-2">{formatDate(p.paid_on)}</td><td>{formatINR(p.amount)}</td><td className="text-muted-foreground">{p.notes || "—"}</td></tr>
              ))}
            </tbody>
          </table>}
      </div>

      {!locked && (
        <div className="rounded-lg border bg-card p-5 space-y-3">
          <h2 className="font-semibold">Cancel invoice</h2>
          <p className="text-sm text-muted-foreground">Cancelling keeps the invoice number reserved but excludes it from revenue/outstanding.</p>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="md:col-span-2 space-y-2"><Label>Reason (optional)</Label><Textarea rows={2} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} /></div>
            <div className="flex items-end"><Button variant="destructive" onClick={cancel}><Ban className="mr-2 h-4 w-4" /> Cancel invoice</Button></div>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <Button variant="ghost" className="text-destructive" onClick={deleteInvoice}>Delete permanently</Button>
      </div>
    </div>
  );
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="text-xs uppercase text-muted-foreground">{title}</div>
      <div className="mt-2">{children}</div>
    </div>
  );
}
function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (<div className={`flex justify-between ${bold ? "text-base font-bold" : ""}`}><span>{label}</span><span>{value}</span></div>);
}
