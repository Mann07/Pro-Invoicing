import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { formatINR, formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

const statusColors: Record<string, string> = {
  paid: "bg-success text-success-foreground",
  partial: "bg-warning text-warning-foreground",
  unpaid: "bg-destructive text-destructive-foreground",
};

function Dashboard() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*, dealers(name), customers(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const filtered = useMemo(() => {
    return invoices.filter((inv: any) => {
      if (status !== "all" && inv.status !== status) return false;
      if (dateFrom && inv.issue_date < dateFrom) return false;
      if (dateTo && inv.issue_date > dateTo) return false;
      if (q) {
        const s = q.toLowerCase();
        const hay = [
          inv.invoice_number,
          inv.dealers?.name,
          inv.customers?.name,
          String(inv.total),
        ].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [invoices, q, status, dateFrom, dateTo]);

  const totals = useMemo(() => {
    const outstanding = filtered.reduce((s: number, i: any) => s + Number(i.total) - Number(i.amount_paid), 0);
    const collected = filtered.reduce((s: number, i: any) => s + Number(i.amount_paid), 0);
    return { outstanding, collected, count: filtered.length };
  }, [filtered]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Invoices</h1>
          <p className="text-sm text-muted-foreground">Search, filter, and manage all invoices.</p>
        </div>
        <Link to="/invoices/new">
          <Button><Plus className="mr-2 h-4 w-4" /> New Invoice</Button>
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Invoices" value={String(totals.count)} />
        <StatCard label="Collected" value={formatINR(totals.collected)} />
        <StatCard label="Outstanding" value={formatINR(totals.outstanding)} accent />
      </div>

      <div className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-4">
        <div className="relative md:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search number, dealer, vendor, amount…"
            className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="partial">Partial</SelectItem>
            <SelectItem value="unpaid">Unpaid</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex gap-2">
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-10 text-center">
            <FileText className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No invoices match your filters.</p>
            <Link to="/invoices/new"><Button size="sm">Create your first invoice</Button></Link>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <table className="hidden w-full md:table">
              <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Number</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Dealer</th>
                  <th className="px-4 py-3">Vendor</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-right">Paid</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((inv: any) => (
                  <tr key={inv.id} className="hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <Link to="/invoices/$id" params={{ id: inv.id }} className="font-medium text-primary hover:underline">
                        {inv.invoice_number}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm">{formatDate(inv.issue_date)}</td>
                    <td className="px-4 py-3 text-sm">{inv.dealers?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-sm">{inv.customers?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-right text-sm">{formatINR(inv.total)}</td>
                    <td className="px-4 py-3 text-right text-sm">{formatINR(inv.amount_paid)}</td>
                    <td className="px-4 py-3">
                      <Badge className={statusColors[inv.status]}>{inv.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* Mobile cards */}
            <div className="divide-y md:hidden">
              {filtered.map((inv: any) => (
                <Link key={inv.id} to="/invoices/$id" params={{ id: inv.id }}
                  className="block p-4 hover:bg-muted/40">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-primary">{inv.invoice_number}</span>
                    <Badge className={statusColors[inv.status]}>{inv.status}</Badge>
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {inv.dealers?.name ?? "—"} · {formatDate(inv.issue_date)}
                  </div>
                  <div className="mt-1 text-sm">
                    <span className="font-semibold">{formatINR(inv.total)}</span>
                    <span className="text-muted-foreground"> · paid {formatINR(inv.amount_paid)}</span>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${accent ? "text-accent-foreground" : ""}`}>{value}</div>
    </div>
  );
}
