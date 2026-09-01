import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowUpDown, Pencil, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { PartyFormDialog } from "@/components/party-form-dialog";
import { formatDate, formatINR } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/dealers/$id")({
  component: DealerDetail,
});

const statusColors: Record<string, string> = {
  paid: "bg-success text-success-foreground",
  partial: "bg-warning text-warning-foreground",
  pending: "bg-destructive text-destructive-foreground",
  draft: "bg-muted text-muted-foreground",
  cancelled: "bg-muted text-muted-foreground line-through",
};

type SortKey = "invoice_number" | "issue_date" | "total" | "status" | "amount_paid" | "outstanding";

const describe = (inv: any) => {
  const items = Array.isArray(inv.line_items) ? inv.line_items : [];
  const first = items[0]?.description ?? "";
  return items.length > 1 ? `${first} +${items.length - 1} more` : first || "—";
};
const outstandingOf = (inv: any) =>
  Math.max(0, Number(inv.total) - Number(inv.tds_amount ?? 0) - Number(inv.amount_paid));

function DealerDetail() {
  const { id } = useParams({ from: "/_authenticated/dealers/$id" });
  const [editOpen, setEditOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "issue_date", dir: "desc" });

  const { data: party } = useQuery({
    queryKey: ["dealers", id],
    queryFn: async () => (await (supabase as any).from("dealers").select("*").eq("id", id).maybeSingle()).data as any,
    enabled: !!id,
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ["invoices", "dealer", id],
    queryFn: async () =>
      ((await (supabase as any)
        .from("invoices")
        .select("*")
        .eq("module", "dealer")
        .eq("dealer_id", id)
        .order("issue_date", { ascending: false })).data ?? []) as any[],
    enabled: !!id,
  });

  const invoiceIds = (invoices as any[]).map((i) => i.id);
  const { data: payments = [] } = useQuery({
    queryKey: ["dealer-payments", id, invoiceIds.length],
    queryFn: async () => {
      if (invoiceIds.length === 0) return [] as any[];
      const { data } = await (supabase as any)
        .from("invoice_payments")
        .select("paid_on, amount, tds_amount, invoice_id")
        .in("invoice_id", invoiceIds)
        .order("paid_on", { ascending: false });
      return (data ?? []) as any[];
    },
    enabled: invoiceIds.length > 0,
  });
  const lastPaymentDate = (payments as any[])[0]?.paid_on ?? null;

  const stats = useMemo(() => {
    const active = (invoices as any[]).filter((i) => i.status !== "cancelled");
    const activeIds = new Set(active.map((i) => i.id));
    const tds = active.reduce((s, i) => s + Number(i.tds_amount ?? 0), 0);
    const actualTds = (payments as any[])
      .filter((p) => activeIds.has(p.invoice_id))
      .reduce((s, p) => s + Number(p.tds_amount ?? 0), 0);
    const value = active.reduce((s, i) => s + Number(i.total), 0);
    const paid = active.reduce((s, i) => s + Number(i.amount_paid), 0);
    const gst = active.reduce((s, i) => s + Number(i.gst_amount ?? 0), 0);
    return {
      count: active.length,
      value,
      paid,
      gst,
      outstanding: active.reduce((s, i) => s + outstandingOf(i), 0),
      paidCount: active.filter((i) => i.status === "paid").length,
      pendingCount: active.filter((i) => i.status === "pending" || i.status === "draft").length,
      partialCount: active.filter((i) => i.status === "partial").length,
      lastInvoiceDate: active.map((i) => i.issue_date).sort().at(-1) ?? null,
      tds,
      actualTds,
      tdsDifference: +(actualTds - tds).toFixed(2),
      expected: value - tds,
    };
  }, [invoices, payments]);


  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = (invoices as any[]).filter(
      (i) =>
        !term ||
        [i.invoice_number, i.issue_date, i.status, i.notes, describe(i), String(i.total)]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(term),
    );
    const val = (i: any) => {
      switch (sort.key) {
        case "total": return Number(i.total);
        case "amount_paid": return Number(i.amount_paid);
        case "outstanding": return outstandingOf(i);
        default: return String(i[sort.key] ?? "");
      }
    };
    return [...list].sort((a, b) => {
      const av = val(a), bv = val(b);
      const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [invoices, q, sort]);

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));
  }

  if (!party) return <div className="p-6 text-muted-foreground">Loading…</div>;

  const Th = ({ label, k, right }: { label: string; k?: SortKey; right?: boolean }) => (
    <th className={`px-4 py-2 ${right ? "text-right" : ""}`}>
      {k ? (
        <button type="button" onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 uppercase hover:text-foreground">
          {label} <ArrowUpDown className="h-3 w-3" />
        </button>
      ) : label}
    </th>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/dealers"><Button size="icon" variant="ghost"><ArrowLeft className="h-4 w-4" /></Button></Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{party.nickname || party.name}</h1>
              <Badge variant="outline">{party.is_active === false ? "Inactive" : "Active"}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">Dealer · Prefix {party.invoice_prefix}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link to="/dealers"><Button variant="ghost">Back to Dealers</Button></Link>
          <Button variant="outline" onClick={() => setEditOpen(true)}><Pencil className="mr-2 h-4 w-4" /> Edit dealer</Button>
          <Link to="/invoices/new"><Button><Plus className="mr-2 h-4 w-4" /> New Invoice</Button></Link>
        </div>
      </div>

      {/* Section 1 — Dealer information */}
      <div className="grid gap-4 md:grid-cols-3">
        <InfoCard title="Dealer information">
          <Info label="Dealer name" value={party.name} />
          <Info label="Nickname" value={party.nickname} />
          <Info label="Invoice prefix" value={party.invoice_prefix} />
          <Info label="GSTIN" value={party.gstin} />
          <Info label="Status" value={party.is_active === false ? "Inactive" : "Active"} />
        </InfoCard>
        <InfoCard title="Contact">
          <Info label="Contact person" value={party.contact_person} />
          <Info label="Mobile" value={party.mobile} />
          <Info label="Email" value={party.email} />
          <Info label="Address" value={party.address} />
        </InfoCard>
        <InfoCard title="Notes & defaults">
          <Info label="Notes" value={party.notes} />
          <Info label="Default GST %" value={party.default_gst_rate != null ? `${party.default_gst_rate}%` : null} />
          <Info label="Default HSN/SAC" value={party.default_hsn_sac} />
          <Info label="Default rate" value={party.default_rate != null ? formatINR(party.default_rate) : null} />
        </InfoCard>
      </div>

      {/* Section 2 — Dealer dashboard */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Dealer dashboard</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Total invoices" value={String(stats.count)} />
          <Stat label="Total invoice value" value={formatINR(stats.value)} />
          <Stat label="Total paid" value={formatINR(stats.paid)} />
          <Stat label="Total outstanding" value={formatINR(stats.outstanding)} />
          <Stat label="Paid invoices" value={String(stats.paidCount)} />
          <Stat label="Pending invoices" value={String(stats.pendingCount)} />
          <Stat label="Partially paid" value={String(stats.partialCount)} />
          <Stat label="Last invoice date" value={stats.lastInvoiceDate ? formatDate(stats.lastInvoiceDate) : "—"} />
          <Stat label="Last payment date" value={lastPaymentDate ? formatDate(lastPaymentDate) : "—"} />
          <Stat label="Total GST" value={formatINR(stats.gst)} />
          {stats.tds > 0 && (

            <>
              <Stat label="Total TDS deducted" value={formatINR(stats.tds)} />
              <Stat label="Expected payment" value={formatINR(stats.expected)} />
              <Stat label="Actual payment received" value={formatINR(stats.paid)} />
            </>
          )}
        </div>
      </div>

      {/* Section 3 — Invoice history */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Invoice history</h2>
          <Input
            placeholder="Search this dealer's invoices…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="max-w-xs"
          />
        </div>
        <div className="overflow-x-auto rounded-lg border bg-card">
          {rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No invoices found for this dealer.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <Th label="Number" k="invoice_number" />
                  <Th label="Issue date" k="issue_date" />
                  <Th label="Description" />
                  <Th label="Amount" k="total" right />
                  <Th label="Status" k="status" />
                  <Th label="Received" k="amount_paid" right />
                  <Th label="Outstanding" k="outstanding" right />
                  <Th label="Notes" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((inv) => (
                  <tr key={inv.id} className="hover:bg-muted/40">
                    <td className="px-4 py-2">
                      <Link to="/invoices/$id" params={{ id: inv.id }} className="font-medium text-primary hover:underline">
                        {inv.invoice_number}
                      </Link>
                    </td>
                    <td className="px-4 py-2">{formatDate(inv.issue_date)}</td>
                    <td className="px-4 py-2 max-w-xs truncate">{describe(inv)}</td>
                    <td className="px-4 py-2 text-right">{formatINR(inv.total)}</td>
                    <td className="px-4 py-2"><Badge className={statusColors[inv.status] ?? ""}>{inv.status}</Badge></td>
                    <td className="px-4 py-2 text-right">{formatINR(inv.amount_paid)}</td>
                    <td className="px-4 py-2 text-right">{formatINR(outstandingOf(inv))}</td>
                    <td className="px-4 py-2 text-muted-foreground">{inv.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <PartyFormDialog kind="dealer" open={editOpen} onOpenChange={setEditOpen} party={editOpen ? party : null} />
    </div>
  );
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="text-xs uppercase text-muted-foreground">{title}</div>
      <div className="mt-2 space-y-1">{children}</div>
    </div>
  );
}

function Info({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="text-sm">
      <span className="text-muted-foreground">{label}: </span>
      <span className="font-medium whitespace-pre-line">{value ? String(value) : "—"}</span>
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
