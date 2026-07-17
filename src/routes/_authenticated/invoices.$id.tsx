import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { getInvoiceDownloadUrl } from "@/lib/invoice.functions";
import { formatINR, formatDate, todayISO } from "@/lib/format";
import { generateInvoicePdf } from "@/lib/pdf-client";

export const Route = createFileRoute("/_authenticated/invoices/$id")({
  component: InvoiceDetail,
});

const statusColors: Record<string, string> = {
  paid: "bg-success text-success-foreground",
  partial: "bg-warning text-warning-foreground",
  unpaid: "bg-destructive text-destructive-foreground",
};

function InvoiceDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const dlFn = useServerFn(getInvoiceDownloadUrl);

  const { data: inv, isLoading } = useQuery({
    queryKey: ["invoice", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*, dealers(*), customers(*)")
        .eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [status, setStatus] = useState<string>("");
  const [amountPaid, setAmountPaid] = useState<string>("");
  const [paymentDate, setPaymentDate] = useState(todayISO());
  const [paymentNotes, setPaymentNotes] = useState("");
  const [saving, setSaving] = useState(false);

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading…</div>;
  if (!inv) return <div className="p-6">Not found. <Link to="/dashboard" className="text-primary underline">Back</Link></div>;

  const effectiveStatus = status || inv.status;
  const effectivePaid = amountPaid === "" ? Number(inv.amount_paid) : Number(amountPaid);
  const outstanding = Math.max(0, Number(inv.total) - effectivePaid);

  async function savePayment() {
    setSaving(true);
    const paid = amountPaid === "" ? Number(inv.amount_paid) : Number(amountPaid);
    let nextStatus = status || inv.status;
    if (paid >= Number(inv.total)) nextStatus = "paid";
    else if (paid > 0) nextStatus = "partial";
    else nextStatus = "unpaid";
    const { error } = await supabase.from("invoices").update({
      status: nextStatus as any,
      amount_paid: paid,
      payment_date: paid > 0 ? paymentDate : null,
      payment_notes: paymentNotes || inv.payment_notes,
    }).eq("id", id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Payment updated");
    qc.invalidateQueries({ queryKey: ["invoice", id] });
    qc.invalidateQueries({ queryKey: ["invoices"] });
  }

  async function downloadDocx() {
    if (!inv.docx_path) return toast.error("No DOCX generated (no active template).");
    try {
      const { url } = await dlFn({ data: { path: inv.docx_path } });
      window.open(url, "_blank");
    } catch (e: any) { toast.error(e.message); }
  }

  async function downloadPdf() {
    await generateInvoicePdf(inv);
  }

  async function deleteInvoice() {
    if (!confirm("Delete this invoice?")) return;
    const { error } = await supabase.from("invoices").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    navigate({ to: "/dashboard" });
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
            </div>
            <p className="text-sm text-muted-foreground">Issued {formatDate(inv.issue_date)}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={downloadDocx}><FileText className="mr-2 h-4 w-4" /> DOCX</Button>
          <Button variant="outline" onClick={downloadPdf}><Download className="mr-2 h-4 w-4" /> PDF</Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <InfoCard title="Dealer">
          {inv.dealers ? (
            <>
              <div className="font-medium">{inv.dealers.name}</div>
              {inv.dealers.gstin && <div className="text-sm text-muted-foreground">GSTIN: {inv.dealers.gstin}</div>}
              {inv.dealers.address && <div className="text-sm text-muted-foreground">{inv.dealers.address}</div>}
              {inv.dealers.phone && <div className="text-sm text-muted-foreground">{inv.dealers.phone}</div>}
            </>
          ) : <span className="text-sm text-muted-foreground">—</span>}
        </InfoCard>
        <InfoCard title="Customer">
          {inv.customers ? (
            <>
              <div className="font-medium">{inv.customers.name}</div>
              {inv.customers.vehicle_reg && <div className="text-sm text-muted-foreground">{inv.customers.vehicle_reg} · {inv.customers.vehicle_make_model}</div>}
              {inv.customers.phone && <div className="text-sm text-muted-foreground">{inv.customers.phone}</div>}
              {inv.customers.address && <div className="text-sm text-muted-foreground">{inv.customers.address}</div>}
            </>
          ) : <span className="text-sm text-muted-foreground">—</span>}
        </InfoCard>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Description</th>
              <th className="px-4 py-2 text-right">Qty</th>
              <th className="px-4 py-2 text-right">Rate</th>
              <th className="px-4 py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {(inv.line_items as any[]).map((it, i) => (
              <tr key={i}>
                <td className="px-4 py-2">{it.description}</td>
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
            <Row label="Total" value={formatINR(inv.total)} bold />
            <Row label="Paid" value={formatINR(inv.amount_paid)} />
            <Row label="Outstanding" value={formatINR(Number(inv.total) - Number(inv.amount_paid))} />
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-5">
        <h2 className="font-semibold">Payment</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={effectiveStatus} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unpaid">Unpaid</SelectItem>
                <SelectItem value="partial">Partial</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Amount paid</Label>
            <Input type="number" step="0.01"
              value={amountPaid === "" ? inv.amount_paid : amountPaid}
              onChange={(e) => setAmountPaid(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Payment date</Label>
            <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Outstanding</Label>
            <div className="rounded-md border bg-muted px-3 py-2 text-sm font-medium">{formatINR(outstanding)}</div>
          </div>
          <div className="space-y-2 md:col-span-4">
            <Label>Notes</Label>
            <Textarea rows={2} value={paymentNotes} onChange={(e) => setPaymentNotes(e.target.value)}
              placeholder={inv.payment_notes ?? ""} />
          </div>
        </div>
        <div className="mt-4 flex justify-between">
          <Button variant="destructive" onClick={deleteInvoice}>Delete invoice</Button>
          <Button onClick={savePayment} disabled={saving}>{saving ? "Saving…" : "Update payment"}</Button>
        </div>
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
  return (
    <div className={`flex justify-between ${bold ? "text-base font-bold" : ""}`}>
      <span>{label}</span><span>{value}</span>
    </div>
  );
}
