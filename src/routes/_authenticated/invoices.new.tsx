import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { createInvoice, getNextInvoiceNumber } from "@/lib/invoice.functions";
import { formatINR, todayISO, toIndianWordsINR } from "@/lib/format";
import { MODULES, type ModuleId } from "@/lib/modules";

export const Route = createFileRoute("/_authenticated/invoices/new")({
  component: NewInvoice,
});

type Line = { description: string; hsn_sac: string; qty: number; rate: number; amount: number };

function NewInvoice() {
  const navigate = useNavigate();
  const createFn = useServerFn(createInvoice);
  const [module, setModule] = useState<ModuleId>("dealer");

  const partyTable = module === "dealer" ? "dealers" : module === "vendor" ? "vendors" : module === "transporter" ? "transporters" : null;

  const { data: parties = [] } = useQuery({
    queryKey: [partyTable ?? "none"],
    queryFn: async () => partyTable ? ((await (supabase as any).from(partyTable).select("*").order("name")).data ?? []) : [],
    enabled: !!partyTable,
  });

  const { data: templates = [] } = useQuery({
    queryKey: ["templates", module],
    queryFn: async () => (await (supabase as any).from("invoice_templates").select("*").eq("module", module).eq("status", "active").order("created_at", { ascending: false })).data ?? [],
  });

  const [partyId, setPartyId] = useState<string>("");
  const [customer, setCustomer] = useState({ name: "", address: "", gstin: "", mobile: "", email: "" });
  const [invoiceNumber, setInvoiceNumber] = useState<string>("");
  const [issueDate, setIssueDate] = useState(todayISO());
  const [templateId, setTemplateId] = useState<string>("");
  const [gstRate, setGstRate] = useState<number>(18);
  const [gstEnabled, setGstEnabled] = useState(true);
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<Line[]>([{ description: "", hsn_sac: "", qty: 1, rate: 0, amount: 0 }]);
  const [busy, setBusy] = useState(false);

  const selectedParty = useMemo(() => (parties as any[]).find((p) => p.id === partyId), [parties, partyId]);

  // Reset party selection when module changes
  useEffect(() => { setPartyId(""); setInvoiceNumber(""); setTemplateId(""); }, [module]);

  // Apply party defaults to first line
  useEffect(() => {
    if (!selectedParty) return;
    setItems((prev) => prev.map((it, i) => i === 0 ? {
      description: it.description || selectedParty.default_description || "",
      hsn_sac: it.hsn_sac || selectedParty.default_hsn_sac || "",
      qty: it.qty || 1,
      rate: it.rate || Number(selectedParty.default_rate ?? 0),
      amount: 0,
    } : it));
    if (selectedParty.default_gst_rate != null) setGstRate(Number(selectedParty.default_gst_rate));
    if (selectedParty.default_template_id) setTemplateId(selectedParty.default_template_id);
  }, [selectedParty]);

  // Recompute amounts
  useEffect(() => {
    setItems((prev) => prev.map((it) => ({ ...it, amount: +(Number(it.qty || 0) * Number(it.rate || 0)).toFixed(2) })));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const subtotal = items.reduce((s, it) => s + (it.amount || 0), 0);
  const gstAmt = gstEnabled ? +(subtotal * (gstRate / 100)).toFixed(2) : 0;
  const total = subtotal + gstAmt;
  const amountWords = toIndianWordsINR(total);

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
    if (items.length === 0 || items.some((i) => !i.description)) return toast.error("Add at least one line with description");
    if (module !== "customer" && !partyId) return toast.error(`Select a ${module}`);
    if (module === "customer" && !customer.name) return toast.error("Customer name is required");
    setBusy(true);
    const t = toast.loading("Generating Word document & converting to PDF…");
    try {
      const res = await createFn({
        data: {
          module,
          party_id: module === "customer" ? null : partyId,
          customer: module === "customer" ? customer : null,
          invoice_number: invoiceNumber || null,
          issue_date: issueDate,
          line_items: items,
          gst_rate: gstEnabled ? gstRate : 0,
          notes,
          template_id: templateId || null,
        },
      });
      toast.success(`Invoice ${res.invoice_number} created`, { id: t });
      navigate({ to: "/invoices/$id", params: { id: res.id } });
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to create invoice", { id: t });
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">New Invoice</h1>
        <p className="text-sm text-muted-foreground">Pick the module — each has independent numbering, templates, and reports.</p>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <Tabs value={module} onValueChange={(v) => setModule(v as ModuleId)}>
          <TabsList>
            {MODULES.map((m) => <TabsTrigger key={m.id} value={m.id}>{m.label}</TabsTrigger>)}
          </TabsList>
        </Tabs>
      </div>

      <div className="grid gap-4 rounded-lg border bg-card p-5 md:grid-cols-3">
        {module === "customer" ? (
          <>
            <div className="space-y-2"><Label>Customer name *</Label><Input required value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} /></div>
            <div className="space-y-2"><Label>Mobile</Label><Input value={customer.mobile} onChange={(e) => setCustomer({ ...customer, mobile: e.target.value })} /></div>
            <div className="space-y-2"><Label>GST</Label><Input value={customer.gstin} onChange={(e) => setCustomer({ ...customer, gstin: e.target.value })} /></div>
            <div className="space-y-2 md:col-span-2"><Label>Address</Label><Textarea rows={2} value={customer.address} onChange={(e) => setCustomer({ ...customer, address: e.target.value })} /></div>
            <div className="space-y-2"><Label>Email</Label><Input type="email" value={customer.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value })} /></div>
          </>
        ) : (
          <div className="space-y-2 md:col-span-2">
            <Label>{module.charAt(0).toUpperCase() + module.slice(1)} *</Label>
            <Select value={partyId} onValueChange={setPartyId}>
              <SelectTrigger><SelectValue placeholder={`Select ${module}`} /></SelectTrigger>
              <SelectContent>
                {(parties as any[]).map((d) => (
                  <SelectItem key={d.id} value={d.id}>{(d.nickname ?? d.name)} · {d.invoice_prefix}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-2"><Label>Issue date</Label><Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} required /></div>
        <div className="space-y-2 md:col-span-2">
          <Label>Invoice number (auto if blank)</Label>
          <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="Leave blank to auto-generate" />
        </div>
        <div className="space-y-2">
          <Label>Template</Label>
          <Select value={templateId} onValueChange={setTemplateId}>
            <SelectTrigger><SelectValue placeholder={(templates as any[]).length ? "Auto (first active)" : "No template — upload one"} /></SelectTrigger>
            <SelectContent>
              {(templates as any[]).map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
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
              <Input className="col-span-3 md:col-span-1" inputMode="decimal" placeholder="Qty"
                value={it.qty === 0 ? "" : String(it.qty)}
                onChange={(e) => { const v = e.target.value; if (v === "" || /^\d*\.?\d*$/.test(v)) updateItem(i, { qty: v === "" ? 0 : Number(v) }); }} />
              <Input className="col-span-3 md:col-span-2" inputMode="decimal" placeholder="Rate"
                value={it.rate === 0 ? "" : String(it.rate)}
                onChange={(e) => { const v = e.target.value; if (v === "" || /^\d*\.?\d*$/.test(v)) updateItem(i, { rate: v === "" ? 0 : Number(v) }); }} />
              <div className="col-span-9 md:col-span-1 flex items-center justify-end text-sm font-medium">{formatINR(it.amount)}</div>
              <Button type="button" variant="ghost" size="icon" className="col-span-3 md:col-span-1"
                onClick={() => setItems(items.filter((_, x) => x !== i))} disabled={items.length === 1}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 rounded-lg border bg-card p-5 md:grid-cols-2">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <input type="checkbox" id="gst" checked={gstEnabled} onChange={(e) => setGstEnabled(e.target.checked)} className="h-4 w-4" />
            <Label htmlFor="gst">Apply GST</Label>
          </div>
          {gstEnabled && (
            <div className="space-y-2"><Label>GST rate (%)</Label><Input type="number" step="0.01" value={gstRate} onChange={(e) => setGstRate(Number(e.target.value))} /></div>
          )}
          <div className="space-y-2"><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} /></div>
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
