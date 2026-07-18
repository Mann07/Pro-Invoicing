import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
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
import { createInvoice } from "@/lib/invoice.functions";
import { formatINR, formatDate, todayISO } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/invoices/new")({
  component: NewInvoice,
});

type Line = { description: string; qty: number; rate: number; amount: number };

function NewInvoice() {
  const navigate = useNavigate();
  const createFn = useServerFn(createInvoice);

  const { data: dealers = [] } = useQuery({
    queryKey: ["dealers"],
    queryFn: async () => (await supabase.from("dealers").select("*").order("name")).data ?? [],
  });
  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => (await supabase.from("customers").select("*").order("name")).data ?? [],
  });

  const [dealerId, setDealerId] = useState<string>("");
  const [customerId, setCustomerId] = useState<string>("");
  const [issueDate, setIssueDate] = useState(todayISO());
  const [gstRate, setGstRate] = useState<number>(18);
  const [gstEnabled, setGstEnabled] = useState(true);
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<Line[]>([{ description: "", qty: 1, rate: 0, amount: 0 }]);
  const [busy, setBusy] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const dealer = dealers.find((d: any) => d.id === dealerId);
  const customer = customers.find((c: any) => c.id === customerId);

  const subtotal = items.reduce((s, it) => s + (it.amount || 0), 0);
  const gstAmt = gstEnabled ? +(subtotal * (gstRate / 100)).toFixed(2) : 0;
  const total = subtotal + gstAmt;

  function updateItem(i: number, patch: Partial<Line>) {
    setItems((prev) => prev.map((it, idx) => {
      if (idx !== i) return it;
      const next = { ...it, ...patch };
      next.amount = +(Number(next.qty || 0) * Number(next.rate || 0)).toFixed(2);
      return next;
    }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (items.length === 0 || items.some((i) => !i.description)) {
      return toast.error("Add at least one line item with description");
    }
    setBusy(true);
    try {
      const res = await createFn({
        data: {
          dealer_id: dealerId || null,
          customer_id: customerId || null,
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
        <p className="text-sm text-muted-foreground">The next invoice number is assigned automatically.</p>
      </div>

      <div className="grid gap-4 rounded-lg border bg-card p-5 md:grid-cols-3">
        <div className="space-y-2">
          <Label>Dealer</Label>
          <Select value={dealerId} onValueChange={setDealerId}>
            <SelectTrigger><SelectValue placeholder="Select dealer" /></SelectTrigger>
            <SelectContent>
              {dealers.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Customer</Label>
          <Select value={customerId} onValueChange={setCustomerId}>
            <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
            <SelectContent>
              {customers.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Issue date</Label>
          <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} required />
        </div>
      </div>

      <div className="rounded-lg border bg-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Line items</h2>
          <Button type="button" size="sm" variant="outline"
            onClick={() => setItems([...items, { description: "", qty: 1, rate: 0, amount: 0 }])}>
            <Plus className="mr-1 h-4 w-4" /> Add
          </Button>
        </div>
        <div className="space-y-2">
          {items.map((it, i) => (
            <div key={i} className="grid grid-cols-12 gap-2">
              <Input className="col-span-12 md:col-span-6" placeholder="Description"
                value={it.description} onChange={(e) => updateItem(i, { description: e.target.value })} />
              <Input className="col-span-4 md:col-span-2" type="number" step="1" placeholder="Qty"
                value={it.qty} onChange={(e) => updateItem(i, { qty: Number(e.target.value) })} />
              <Input className="col-span-4 md:col-span-2" type="number" step="0.01" placeholder="Rate"
                value={it.rate} onChange={(e) => updateItem(i, { rate: Number(e.target.value) })} />
              <div className="col-span-3 md:col-span-1 flex items-center justify-end text-sm font-medium">
                {formatINR(it.amount)}
              </div>
              <Button type="button" variant="ghost" size="icon" className="col-span-1"
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
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => navigate({ to: "/dashboard" })}>Cancel</Button>
        <Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create invoice"}</Button>
      </div>
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
