import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { createInvoice, previewNextInvoiceNumber } from "@/lib/invoice.functions";
import { formatINR, formatDate, todayISO, toIndianWordsINR } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/invoices/new")({
  component: NewInvoice,
});

type Line = { description: string; hsn_sac: string; qty: number; rate: number; amount: number };
type BillType = "dealer" | "vendor";

function NewInvoice() {
  const navigate = useNavigate();
  const createFn = useServerFn(createInvoice);
  const previewNumFn = useServerFn(previewNextInvoiceNumber);

  const { data: dealers = [] } = useQuery({
    queryKey: ["dealers"],
    queryFn: async () => (await supabase.from("dealers").select("*").order("name")).data ?? [],
  });
  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => (await supabase.from("customers").select("*").order("name")).data ?? [],
  });

  const [billType, setBillType] = useState<BillType>("dealer");
  const [dealerId, setDealerId] = useState<string>("");
  const [customerId, setCustomerId] = useState<string>("");
  const [invoiceNumber, setInvoiceNumber] = useState<string>("");
  const [issueDate, setIssueDate] = useState(todayISO());
  const [gstRate, setGstRate] = useState<number>(18);
  const [gstEnabled, setGstEnabled] = useState(true);
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<Line[]>([{ description: "", hsn_sac: "", qty: 1, rate: 0, amount: 0 }]);
  const [busy, setBusy] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const dealer = dealers.find((d: any) => d.id === dealerId);
  const customer = customers.find((c: any) => c.id === customerId);

  const subtotal = items.reduce((s, it) => s + (it.amount || 0), 0);
  const gstAmt = gstEnabled ? +(subtotal * (gstRate / 100)).toFixed(2) : 0;
  const total = subtotal + gstAmt;
  const amountWords = toIndianWordsINR(total);

  // Auto-fill invoice number preview when dealer changes.
  useEffect(() => {
    if (!dealerId) { setInvoiceNumber(""); return; }
    let cancelled = false;
    previewNumFn({ data: { dealer_id: dealerId } })
      .then((res) => { if (!cancelled) setInvoiceNumber(res.invoice_number); })
      .catch(() => { /* ignore preview errors */ });
    return () => { cancelled = true; };
  }, [dealerId, previewNumFn]);

  function updateItem(i: number, patch: Partial<Line>) {
    setItems((prev) => prev.map((it, idx) => {
      if (idx !== i) return it;
      const next = { ...it, ...patch };
      next.amount = +(Number(next.qty || 0) * Number(next.rate || 0)).toFixed(2);
      return next;
    }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (items.length === 0 || items.some((i) => !i.description)) {
      return toast.error("Add at least one line item with description");
    }
    if (billType === "dealer" && !dealerId) return toast.error("Select a dealer");
    if (billType === "vendor" && !customerId) return toast.error("Select a vendor");
    setPreviewOpen(true);
  }

  async function confirmCreate() {
    setBusy(true);
    try {
      const res = await createFn({
        data: {
          bill_type: billType,
          dealer_id: dealerId || null,
          customer_id: customerId || null,
          invoice_number: invoiceNumber || null,
          issue_date: issueDate,
          line_items: items,
          gst_rate: gstEnabled ? gstRate : 0,
          notes,
        },
      });
      toast.success(`Created ${res.invoice_number}`);
      navigate({ to: "/invoices/$id", params: { id: res.id } });
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to create invoice");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">New Invoice</h1>
        <p className="text-sm text-muted-foreground">Choose bill type, dealer/vendor, and line items.</p>
      </div>

      {/* Bill type */}
      <div className="rounded-lg border bg-card p-5">
        <Label className="text-sm">Bill type</Label>
        <div className="mt-2 inline-flex rounded-md border bg-muted p-1">
          {(["dealer", "vendor"] as const).map((t) => (
            <button key={t} type="button"
              onClick={() => setBillType(t)}
              className={`rounded px-4 py-1.5 text-sm capitalize transition-colors ${
                billType === t ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              }`}>
              {t === "dealer" ? "Dealer bill" : "Vendor bill"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 rounded-lg border bg-card p-5 md:grid-cols-3">
        {billType === "dealer" ? (
          <div className="space-y-2 md:col-span-2">
            <Label>Dealer *</Label>
            <Select value={dealerId} onValueChange={setDealerId}>
              <SelectTrigger><SelectValue placeholder="Select dealer" /></SelectTrigger>
              <SelectContent>
                {dealers.map((d: any) => (
                  <SelectItem key={d.id} value={d.id}>
                    {(d.nickname ?? d.name)} · {d.invoice_prefix}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="space-y-2 md:col-span-2">
            <Label>Vendor *</Label>
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger>
              <SelectContent>
                {customers.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-2">
          <Label>Issue date</Label>
          <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} required />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label>Invoice number {billType === "dealer" && dealerId ? "(auto from prefix, editable)" : ""}</Label>
          <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)}
            placeholder={billType === "dealer" ? "Select dealer to auto-fill" : "Leave blank for auto"} />
        </div>
      </div>

      <div className="rounded-lg border bg-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Line items</h2>
          <Button type="button" size="sm" variant="outline"
            onClick={() => setItems([...items, { description: "", hsn_sac: "", qty: 1, rate: 0, amount: 0 }])}>
            <Plus className="mr-1 h-4 w-4" /> Add
          </Button>
        </div>
        <div className="space-y-2">
          {items.map((it, i) => (
            <div key={i} className="grid grid-cols-12 gap-2">
              <Input className="col-span-12 md:col-span-5" placeholder="Description"
                value={it.description} onChange={(e) => updateItem(i, { description: e.target.value })} />
              <Input className="col-span-6 md:col-span-2" placeholder="HSN/SAC"
                value={it.hsn_sac} onChange={(e) => updateItem(i, { hsn_sac: e.target.value })} />
              <Input className="col-span-3 md:col-span-1" type="number" step="1" placeholder="Qty"
                value={it.qty} onChange={(e) => updateItem(i, { qty: Number(e.target.value) })} />
              <Input className="col-span-3 md:col-span-2" type="number" step="0.01" placeholder="Rate"
                value={it.rate} onChange={(e) => updateItem(i, { rate: Number(e.target.value) })} />
              <div className="col-span-9 md:col-span-1 flex items-center justify-end text-sm font-medium">
                {formatINR(it.amount)}
              </div>
              <Button type="button" variant="ghost" size="icon" className="col-span-3 md:col-span-1"
                onClick={() => setItems(items.filter((_, x) => x !== i))}
                disabled={items.length === 1}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 rounded-lg border bg-card p-5 md:grid-cols-2">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <input type="checkbox" id="gst" checked={gstEnabled}
              onChange={(e) => setGstEnabled(e.target.checked)} className="h-4 w-4" />
            <Label htmlFor="gst">Apply GST</Label>
          </div>
          {gstEnabled && (
            <div className="space-y-2">
              <Label>GST rate (%)</Label>
              <Input type="number" step="0.01" value={gstRate}
                onChange={(e) => setGstRate(Number(e.target.value))} />
            </div>
          )}
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
        </div>
        <div className="space-y-2 rounded-md bg-muted p-4">
          <Row label="Subtotal" value={formatINR(subtotal)} />
          {gstEnabled && <Row label={`GST @ ${gstRate}%`} value={formatINR(gstAmt)} />}
          <div className="my-2 border-t" />
          <Row label="Total" value={formatINR(total)} bold />
          <div className="pt-2 text-xs italic text-muted-foreground">
            <span className="font-medium not-italic text-foreground">In words: </span>{amountWords}
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => navigate({ to: "/dashboard" })}>Cancel</Button>
        <Button type="submit">Preview invoice</Button>
      </div>

      <Dialog open={previewOpen} onOpenChange={(o) => !busy && setPreviewOpen(o)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Invoice preview · {billType === "dealer" ? "Dealer bill" : "Vendor bill"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 text-sm">
            <div className="grid gap-4 md:grid-cols-2">
              {billType === "dealer" ? (
                <div>
                  <div className="mb-1 font-semibold">Bill To (Dealer)</div>
                  {dealer ? (
                    <div className="space-y-0.5 text-muted-foreground">
                      <div className="font-medium text-foreground">{dealer.invoice_name || dealer.name}</div>
                      {dealer.gstin && <div>GSTIN: {dealer.gstin}</div>}
                      {dealer.address && <div className="whitespace-pre-line">{dealer.address}</div>}
                      {dealer.phone && <div>{dealer.phone}</div>}
                    </div>
                  ) : <div className="text-muted-foreground">—</div>}
                </div>
              ) : (
                <div>
                  <div className="mb-1 font-semibold">Bill To (Vendor)</div>
                  {customer ? (
                    <div className="space-y-0.5 text-muted-foreground">
                      <div className="font-medium text-foreground">{customer.name}</div>
                      {customer.phone && <div>{customer.phone}</div>}
                      {customer.address && <div className="whitespace-pre-line">{customer.address}</div>}
                    </div>
                  ) : <div className="text-muted-foreground">—</div>}
                </div>
              )}
              <div>
                <div className="mb-1 font-semibold">Invoice</div>
                <div className="space-y-0.5 text-muted-foreground">
                  <div><span className="text-foreground font-medium">No:</span> {invoiceNumber || "(auto)"}</div>
                  <div><span className="text-foreground font-medium">Date:</span> {formatDate(issueDate)}</div>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-3 py-2 text-left">#</th>
                    <th className="px-3 py-2 text-left">Description</th>
                    <th className="px-3 py-2 text-left">HSN/SAC</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Rate</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-3 py-2">{i + 1}</td>
                      <td className="px-3 py-2">{it.description}</td>
                      <td className="px-3 py-2">{it.hsn_sac || "—"}</td>
                      <td className="px-3 py-2 text-right">{it.qty}</td>
                      <td className="px-3 py-2 text-right">{formatINR(it.rate)}</td>
                      <td className="px-3 py-2 text-right">{formatINR(it.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="ml-auto w-full max-w-xs space-y-1 rounded-md bg-muted p-4">
              <Row label="Subtotal" value={formatINR(subtotal)} />
              {gstEnabled
                ? <Row label={`GST @ ${gstRate}%`} value={formatINR(gstAmt)} />
                : <Row label="GST" value="Not applied" />}
              <div className="my-2 border-t" />
              <Row label="Total" value={formatINR(total)} bold />
            </div>

            <div className="rounded-md border p-3 text-sm">
              <span className="font-semibold">Amount in words: </span>
              <span className="italic">{amountWords}</span>
            </div>

            {notes && (
              <div>
                <div className="font-semibold">Notes</div>
                <div className="whitespace-pre-line text-muted-foreground">{notes}</div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPreviewOpen(false)} disabled={busy}>Back to edit</Button>
            <Button type="button" onClick={confirmCreate} disabled={busy}>{busy ? "Creating…" : "Confirm & create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between text-sm ${bold ? "text-base font-bold" : ""}`}>
      <span>{label}</span><span>{value}</span>
    </div>
  );
}
