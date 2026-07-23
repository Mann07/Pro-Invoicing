import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { listMissingSeqs } from "@/lib/invoice.functions";
import { formatDate, formatINR } from "@/lib/format";
import type { ModuleId } from "@/lib/modules";

const statusColors: Record<string, string> = {
  paid: "bg-success text-success-foreground",
  partial: "bg-warning text-warning-foreground",
  pending: "bg-destructive text-destructive-foreground",
  draft: "bg-muted text-muted-foreground",
  cancelled: "bg-muted text-muted-foreground line-through",
};

export function InvoiceListSection({
  module,
  dealerId,
  showHeader = true,
  newInvoiceHref,
}: {
  module: ModuleId;
  dealerId?: string; // only relevant when module === "dealer"
  showHeader?: boolean;
  newInvoiceHref?: string;
}) {
  const missingFn = useServerFn(listMissingSeqs);

  const { data: invoices = [] } = useQuery({
    queryKey: ["invoices", module, dealerId ?? "all"],
    queryFn: async () => {
      let q = (supabase as any).from("invoices").select("*").eq("module", module).order("invoice_seq", { ascending: false });
      if (module === "dealer" && dealerId) q = q.eq("dealer_id", dealerId);
      const { data } = await q;
      return (data ?? []) as any[];
    },
  });

  const { data: missing = { missing: [] as number[] } } = useQuery({
    queryKey: ["missing", module, dealerId ?? "all"],
    queryFn: () => missingFn({ data: { module, dealer_id: dealerId ?? null } }),
    enabled: module !== "dealer" || !!dealerId,
  });

  const totals = useMemo(() => {
    const active = invoices.filter((i) => i.status !== "cancelled");
    return {
      count: active.length,
      revenue: active.reduce((s, i) => s + Number(i.total), 0),
      collected: active.reduce((s, i) => s + Number(i.amount_paid), 0),
      outstanding: active.reduce((s, i) => s + Number(i.total) - Number(i.amount_paid), 0),
    };
  }, [invoices]);

  return (
    <div className="space-y-4">
      {showHeader && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Invoices</h2>
          {newInvoiceHref && (
            <Link to={newInvoiceHref}>
              <Button size="sm"><Plus className="mr-1 h-4 w-4" /> New Invoice</Button>
            </Link>
          )}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard label="Invoices" value={String(totals.count)} />
        <StatCard label="Revenue" value={formatINR(totals.revenue)} />
        <StatCard label="Collected" value={formatINR(totals.collected)} />
        <StatCard label="Outstanding" value={formatINR(totals.outstanding)} accent />
      </div>

      {missing.missing.length > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-warning bg-warning/10 p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 text-warning-foreground" />
          <div>
            <div className="font-medium">Missing invoice numbers</div>
            <div className="text-muted-foreground">
              Sequence gaps at: {missing.missing.join(", ")}. Create the missing invoice(s) or mark the number(s) as cancelled from a new invoice form.
            </div>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border bg-card">
        {invoices.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No invoices yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Number</th>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2 text-right">Total</th>
                <th className="px-4 py-2 text-right">Paid</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {invoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-muted/40">
                  <td className="px-4 py-2">
                    <Link to="/invoices/$id" params={{ id: inv.id }} className="font-medium text-primary hover:underline">
                      {inv.invoice_number}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{formatDate(inv.issue_date)}</td>
                  <td className="px-4 py-2 text-right">{formatINR(inv.total)}</td>
                  <td className="px-4 py-2 text-right">{formatINR(inv.amount_paid)}</td>
                  <td className="px-4 py-2">
                    <Badge className={statusColors[inv.status] ?? ""}>{inv.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xl font-bold ${accent ? "text-accent-foreground" : ""}`}>{value}</div>
    </div>
  );
}
