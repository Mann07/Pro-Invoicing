import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { formatINR, formatDate } from "@/lib/format";
import { MODULES, type ModuleId } from "@/lib/modules";

export const Route = createFileRoute("/_authenticated/reports")({
  component: ReportsPage,
});

function ReportsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground">Separate reports per module. Cancelled invoices are excluded from totals.</p>
      </div>
      <Tabs defaultValue="dealer">
        <TabsList>
          {MODULES.map((m) => <TabsTrigger key={m.id} value={m.id}>{m.label}</TabsTrigger>)}
        </TabsList>
        {MODULES.map((m) => (
          <TabsContent key={m.id} value={m.id}>
            <ModuleReport module={m.id} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

type Filters = {
  partyName: string;
  nickname: string;
  invoiceNumber: string;
  prefix: string;
  date: string;
  from: string;
  to: string;
  month: string;
  year: string;
  status: string;
  minAmount: string;
  maxAmount: string;
  hsn: string;
};

const EMPTY: Filters = {
  partyName: "", nickname: "", invoiceNumber: "", prefix: "", date: "", from: "", to: "",
  month: "all", year: "", status: "all", minAmount: "", maxAmount: "", hsn: "",
};

function ModuleReport({ module }: { module: ModuleId }) {
  const [f, setF] = useState<Filters>(EMPTY);
  const set = (patch: Partial<Filters>) => setF((prev) => ({ ...prev, ...patch }));

  const partyTable = module === "dealer" ? "dealers" : module === "vendor" ? "vendors" : module === "transporter" ? "transporters" : null;
  const partyKey = module === "dealer" ? "dealer_id" : module === "vendor" ? "vendor_id" : "transporter_id";

  const { data: invoices = [] } = useQuery({
    queryKey: ["report", module],
    queryFn: async () => (await (supabase as any).from("invoices").select("*").eq("module", module).order("issue_date", { ascending: false })).data ?? [],
  });

  const invoiceIds = (invoices as any[]).map((i) => i.id);
  const { data: payments = [] } = useQuery({
    queryKey: ["report-payments", module, invoiceIds.length],
    queryFn: async () => {
      if (invoiceIds.length === 0) return [] as any[];
      const { data } = await (supabase as any)
        .from("invoice_payments")
        .select("invoice_id, amount, tds_amount")
        .in("invoice_id", invoiceIds);
      return (data ?? []) as any[];
    },
    enabled: invoiceIds.length > 0,
  });

  // Actual TDS recorded against each invoice's payments.
  const actualTdsById = useMemo(() => {
    const map = new Map<string, number>();
    (payments as any[]).forEach((p) => map.set(p.invoice_id, (map.get(p.invoice_id) ?? 0) + Number(p.tds_amount ?? 0)));
    return map;
  }, [payments]);

  const { data: parties = [] } = useQuery({
    queryKey: ["report-parties", partyTable ?? "none"],
    queryFn: async () => partyTable ? ((await (supabase as any).from(partyTable).select("id, name, nickname, invoice_prefix")).data ?? []) : [],
    enabled: !!partyTable,
  });

  const partyById = useMemo(() => {
    const map = new Map<string, any>();
    (parties as any[]).forEach((p) => map.set(p.id, p));
    return map;
  }, [parties]);

  const rows = useMemo(() => {
    const inc = (hay: unknown, needle: string) => String(hay ?? "").toLowerCase().includes(needle.trim().toLowerCase());
    return (invoices as any[])
      .map((inv) => ({ inv, party: partyTable ? partyById.get(inv[partyKey]) : null }))
      .filter(({ inv, party }) => {
        const name = party?.name ?? inv.customer_name ?? "";
        if (f.partyName && !inc(name, f.partyName)) return false;
        if (f.nickname && !inc(party?.nickname, f.nickname)) return false;
        if (f.invoiceNumber && !inc(inv.invoice_number, f.invoiceNumber)) return false;
        if (f.prefix && !inc(inv.invoice_number, f.prefix)) return false;
        if (f.date && inv.issue_date !== f.date) return false;
        if (f.from && inv.issue_date < f.from) return false;
        if (f.to && inv.issue_date > f.to) return false;
        if (f.month !== "all" && new Date(inv.issue_date).getMonth() !== Number(f.month)) return false;
        if (f.year && String(new Date(inv.issue_date).getFullYear()) !== f.year.trim()) return false;
        if (f.status !== "all" && inv.status !== f.status) return false;
        if (f.minAmount && Number(inv.total) < Number(f.minAmount)) return false;
        if (f.maxAmount && Number(inv.total) > Number(f.maxAmount)) return false;
        if (f.hsn && !((inv.line_items as any[]) ?? []).some((li) => inc(li?.hsn_sac, f.hsn))) return false;
        return true;
      });
  }, [invoices, partyById, partyTable, partyKey, f]);

  const active = rows.filter((r) => r.inv.status !== "cancelled");
  const summary = {
    count: rows.length,
    revenue: active.reduce((s, r) => s + Number(r.inv.total), 0),
    paid: active.reduce((s, r) => s + Number(r.inv.amount_paid), 0),
    outstanding: active.reduce((s, r) => s + Number(r.inv.total) - Number(r.inv.amount_paid), 0),
  };

  function exportInvoices() {
    const data = rows.map(({ inv, party }) => ({
      "Invoice #": inv.invoice_number,
      "Date": formatDate(inv.issue_date),
      "Party": party?.name ?? inv.customer_name ?? "",
      "Nickname": party?.nickname ?? "",
      "HSN/SAC": (((inv.line_items as any[]) ?? []).map((li) => li?.hsn_sac).filter(Boolean).join(", ")),
      "Subtotal": Number(inv.subtotal),
      "GST %": Number(inv.gst_rate),
      "GST Amount": Number(inv.gst_amount),
      "Total": Number(inv.total),
      "Paid": Number(inv.amount_paid),
      "Outstanding": Number(inv.total) - Number(inv.amount_paid),
      "Status": inv.status,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Invoices");
    XLSX.writeFile(wb, `${module}-invoices-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-4">
        {partyTable && (
          <>
            <Field label="Name"><Input value={f.partyName} onChange={(e) => set({ partyName: e.target.value })} placeholder="Dealer / party name" /></Field>
            <Field label="Nickname"><Input value={f.nickname} onChange={(e) => set({ nickname: e.target.value })} placeholder="Nickname" /></Field>
          </>
        )}
        <Field label="Invoice number"><Input value={f.invoiceNumber} onChange={(e) => set({ invoiceNumber: e.target.value })} placeholder="e.g. 025" /></Field>
        <Field label="Invoice prefix"><Input value={f.prefix} onChange={(e) => set({ prefix: e.target.value })} placeholder="e.g. EMIBM-" /></Field>
        <Field label="Invoice date"><Input type="date" value={f.date} onChange={(e) => set({ date: e.target.value })} /></Field>
        <Field label="From"><Input type="date" value={f.from} onChange={(e) => set({ from: e.target.value })} /></Field>
        <Field label="To"><Input type="date" value={f.to} onChange={(e) => set({ to: e.target.value })} /></Field>
        <Field label="Month">
          <Select value={f.month} onValueChange={(v) => set({ month: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All months</SelectItem>
              {MONTHS.map((m, i) => <SelectItem key={m} value={String(i)}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Year"><Input inputMode="numeric" value={f.year} onChange={(e) => set({ year: e.target.value })} placeholder="e.g. 2026" /></Field>
        <Field label="Payment status">
          <Select value={f.status} onValueChange={(v) => set({ status: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="partial">Partially paid</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Min amount"><Input inputMode="decimal" value={f.minAmount} onChange={(e) => set({ minAmount: e.target.value })} placeholder="0" /></Field>
        <Field label="Max amount"><Input inputMode="decimal" value={f.maxAmount} onChange={(e) => set({ maxAmount: e.target.value })} placeholder="Any" /></Field>
        <Field label="HSN/SAC"><Input value={f.hsn} onChange={(e) => set({ hsn: e.target.value })} placeholder="Code" /></Field>
        <div className="flex items-end gap-2 md:col-span-2">
          <Button onClick={exportInvoices}><Download className="mr-2 h-4 w-4" /> Export Excel</Button>
          <Button variant="outline" onClick={() => setF(EMPTY)}>Clear filters</Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Stat label="Total records" value={String(summary.count)} />
        <Stat label="Total invoice amount" value={formatINR(summary.revenue)} />
        <Stat label="Total paid" value={formatINR(summary.paid)} />
        <Stat label="Total outstanding" value={formatINR(summary.outstanding)} />
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        {rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No invoices match these filters.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Number</th>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Party</th>
                <th className="px-4 py-2 text-right">Total</th>
                <th className="px-4 py-2 text-right">Paid</th>
                <th className="px-4 py-2 text-right">Outstanding</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map(({ inv, party }) => (
                <tr key={inv.id} className="hover:bg-muted/40">
                  <td className="px-4 py-2 font-medium">
                    <Link to="/invoices/$id" params={{ id: inv.id }} className="text-primary hover:underline">
                      {inv.invoice_number}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{formatDate(inv.issue_date)}</td>
                  <td className="px-4 py-2">{party?.nickname || party?.name || inv.customer_name || "—"}</td>
                  <td className="px-4 py-2 text-right">{formatINR(inv.total)}</td>
                  <td className="px-4 py-2 text-right">{formatINR(inv.amount_paid)}</td>
                  <td className="px-4 py-2 text-right">{formatINR(Number(inv.total) - Number(inv.amount_paid))}</td>
                  <td className="px-4 py-2 capitalize">{inv.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label>{label}</Label>{children}</div>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-bold">{value}</div>
    </div>
  );
}
