import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FileText, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { formatINR } from "@/lib/format";
import { MODULES, type ModuleId } from "@/lib/modules";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function useModuleTotals(module: ModuleId) {
  return useQuery({
    queryKey: ["dashboard", module],
    queryFn: async () => {
      const { data } = await (supabase as any).from("invoices").select("total,amount_paid,status,invoice_number,issue_date,id").eq("module", module).order("created_at", { ascending: false }).limit(10);
      const rows = (data ?? []) as any[];
      const active = rows.filter((r) => r.status !== "cancelled");
      return {
        count: active.length,
        revenue: active.reduce((s, r) => s + Number(r.total), 0),
        collected: active.reduce((s, r) => s + Number(r.amount_paid), 0),
        outstanding: active.reduce((s, r) => s + Number(r.total) - Number(r.amount_paid), 0),
        recent: rows,
      };
    },
  });
}

function Dashboard() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Four independent modules. Nothing is mixed.</p>
        </div>
        <Link to="/invoices/new"><Button><Plus className="mr-2 h-4 w-4" /> New Invoice</Button></Link>
      </div>

      <Tabs defaultValue="dealer">
        <TabsList>
          {MODULES.map((m) => <TabsTrigger key={m.id} value={m.id}>{m.label}</TabsTrigger>)}
        </TabsList>
        {MODULES.map((m) => (
          <TabsContent key={m.id} value={m.id} className="space-y-4">
            <ModuleSummary module={m.id} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function ModuleSummary({ module }: { module: ModuleId }) {
  const { data, isLoading } = useModuleTotals(module);
  if (isLoading || !data) return <div className="text-sm text-muted-foreground">Loading…</div>;
  return (
    <>
      <div className="grid gap-3 md:grid-cols-4">
        <Stat label="Invoices (recent)" value={String(data.count)} />
        <Stat label="Revenue" value={formatINR(data.revenue)} />
        <Stat label="Collected" value={formatINR(data.collected)} />
        <Stat label="Outstanding" value={formatINR(data.outstanding)} accent />
      </div>
      <div className="overflow-hidden rounded-lg border bg-card">
        {data.recent.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-10 text-center">
            <FileText className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No {module} invoices yet.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Number</th>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2 text-right">Total</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.recent.map((inv: any) => (
                <tr key={inv.id} className="hover:bg-muted/40">
                  <td className="px-4 py-2">
                    <Link to="/invoices/$id" params={{ id: inv.id }} className="font-medium text-primary hover:underline">
                      {inv.invoice_number}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{inv.issue_date}</td>
                  <td className="px-4 py-2 text-right">{formatINR(inv.total)}</td>
                  <td className="px-4 py-2 capitalize">{inv.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${accent ? "text-accent-foreground" : ""}`}>{value}</div>
    </div>
  );
}
