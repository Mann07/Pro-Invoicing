import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowUpDown, Pencil, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { PartyFormDialog, PARTY_TABLE, type PartyKind } from "@/components/party-form-dialog";
import { formatDate, formatINR } from "@/lib/format";

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

const FK: Record<Exclude<PartyKind, "customer">, string> = {
  dealer: "dealer_id",
  vendor: "vendor_id",
  transporter: "transporter_id",
} as any;

export function PartyDetailPage({
  kind,
  id,
  singular,
  listRoute,
  listLabel,
}: {
  kind: Exclude<PartyKind, "customer">;
  id: string;
  singular: string;
  listRoute: "/vendors" | "/transporters";
  listLabel: string;
}) {
  const table = PARTY_TABLE[kind];
  const fk = FK[kind];
  const [editOpen, setEditOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "issue_date", dir: "desc" });

  const { data: party } = useQuery({
    queryKey: [table, id],
    queryFn: async () => (await (supabase as any).from(table).select("*").eq("id", id).maybeSingle()).data as any,
    enabled: !!id,
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ["invoices", kind, id],
    queryFn: async () =>
      ((await (supabase as any)
        .from("invoices")
        .select("*")
        .eq("module", kind)
        .eq(fk, id)
        .order("issue_date", { ascending: false })).data ?? []) as any[],
    enabled: !!id,
  });

  const invoiceIds = (invoices as any[]).map((i) => i.id);
  const { data: lastPaymentDate } = useQuery({
    queryKey: [kind, "last-payment", id, invoiceIds.length],
    queryFn: async () => {
      if (invoiceIds.length === 0) return null;
      const { data } = await (supabase as any)
        .from("invoice_payments")
        .select("paid_on")
        .in("invoice_id", invoiceIds)
        .order("paid_on", { ascending: false })
        .limit(1);
      return (data?.[0]?.paid_on ?? null) as string | null;
    },
    enabled: invoiceIds.length > 0,
  });

  const stats = useMemo(() => {
    const active = (invoices as any[]).filter((i) => i.status !== "cancelled");
    const tds = active.reduce((s, i) => s + Number(i.tds_amount ?? 0), 0);
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
      expected: value - tds,
    };
  }, [invoices]);

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
          <Link to={listRoute}><Button size="icon" variant="ghost"><ArrowLeft className="h-4 w-4" /></Button></Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{party.nickname || party.name}</h1>
              <Badge variant="outline">{party.is_active === false ? "Inactive" : "Active"}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">{singular} · Prefix {party.invoice_prefix}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link to={listRoute}><Button variant="ghost">Back to {listLabel}</Button></Link>
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="mr-2 h-4 w-4" /> Edit {singular.toLowerCase()}
          </Button>
          <Link to="/invoices/new"><Button><Plus className="mr-2 h-4 w-4" /> New Invoice</Button></Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <InfoCard title={`${singular} information`}>
          <Info label={`${singular} name`} value={party.name} />
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

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">{singular} dashboard</h2>
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

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Invoice history</h2>
          <Input
            placeholder={`Search this ${singular.toLowerCase()}'s invoices…`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="max-w-xs"
          />
        </div>
        <div className="overflow-x-auto rounded-lg border bg-card">
          {rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No invoices found for this {singular.toLowerCase()}.
            </div>
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

      <PartyFormDialog kind={kind} open={editOpen} onOpenChange={setEditOpen} party={editOpen ? party : null} />
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
