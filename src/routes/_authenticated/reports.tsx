import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

function ModuleReport({ module }: { module: ModuleId }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const { data = [] } = useQuery({
    queryKey: ["report", module],
    queryFn: async () => (await (supabase as any).from("invoices").select("*").eq("module", module).order("issue_date", { ascending: false })).data ?? [],
  });

  const filtered = (data as any[]).filter((inv) => {
    if (from && inv.issue_date < from) return false;
    if (to && inv.issue_date > to) return false;
    return true;
  });
  const active = filtered.filter((i) => i.status !== "cancelled");
  const summary = {
    count: active.length,
    revenue: active.reduce((s, i) => s + Number(i.total), 0),
    paid: active.reduce((s, i) => s + Number(i.amount_paid), 0),
    outstanding: active.reduce((s, i) => s + Number(i.total) - Number(i.amount_paid), 0),
    cancelled: filtered.length - active.length,
  };

  function exportInvoices() {
    const rows = filtered.map((inv) => ({
      "Invoice #": inv.invoice_number,
      "Date": formatDate(inv.issue_date),
      "Subtotal": Number(inv.subtotal),
      "GST %": Number(inv.gst_rate),
      "GST Amount": Number(inv.gst_amount),
      "Total": Number(inv.total),
      "Paid": Number(inv.amount_paid),
      "Outstanding": Number(inv.total) - Number(inv.amount_paid),
      "Status": inv.status,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Invoices");
    XLSX.writeFile(wb, `${module}-invoices-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-4">
        <div className="space-y-1"><Label>From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="space-y-1"><Label>To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <div className="flex items-end md:col-span-2">
          <Button onClick={exportInvoices}><Download className="mr-2 h-4 w-4" /> Export Excel</Button>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-5">
        <Stat label="Invoices" value={String(summary.count)} />
        <Stat label="Revenue" value={formatINR(summary.revenue)} />
        <Stat label="Collected" value={formatINR(summary.paid)} />
        <Stat label="Outstanding" value={formatINR(summary.outstanding)} />
        <Stat label="Cancelled" value={String(summary.cancelled)} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-bold">{value}</div>
    </div>
  );
}
