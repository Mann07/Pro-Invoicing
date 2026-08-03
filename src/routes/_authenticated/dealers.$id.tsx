import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Pencil, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

function DealerDetail() {
  const { id } = useParams({ from: "/_authenticated/dealers/$id" });
  const [editOpen, setEditOpen] = useState(false);

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
        .order("invoice_seq", { ascending: false })).data ?? []) as any[],
    enabled: !!id,
  });

  const totals = useMemo(() => {
    const active = (invoices as any[]).filter((i) => i.status !== "cancelled");
    const expected = (i: any) => Number(i.total) - Number(i.tds_amount ?? 0);
    return {
      count: active.length,
      value: active.reduce((s, i) => s + Number(i.total), 0),
      paid: active.reduce((s, i) => s + Number(i.amount_paid), 0),
      outstanding: active.reduce((s, i) => s + Math.max(0, expected(i) - Number(i.amount_paid)), 0),
    };
  }, [invoices]);

  if (!party) return <div className="p-6 text-muted-foreground">Loading…</div>;

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
          <Button variant="outline" onClick={() => setEditOpen(true)}><Pencil className="mr-2 h-4 w-4" /> Edit dealer</Button>
          <Link to="/invoices/new"><Button><Plus className="mr-2 h-4 w-4" /> New Invoice</Button></Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <InfoCard title="Dealer information">
          <Info label="Dealer name" value={party.name} />
          <Info label="Nickname" value={party.nickname} />
          <Info label="Invoice prefix" value={party.invoice_prefix} />
          <Info label="GST number" value={party.gstin} />
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
        <h2 className="text-lg font-semibold">Invoice history</h2>
        <div className="overflow-x-auto rounded-lg border bg-card">
          {(invoices as any[]).length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No invoices for this dealer yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Number</th>
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2 text-right">Received</th>
                  <th className="px-4 py-2 text-right">Outstanding</th>
                  <th className="px-4 py-2">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(invoices as any[]).map((inv) => {
                  const expected = Number(inv.total) - Number(inv.tds_amount ?? 0);
                  return (
                    <tr key={inv.id} className="hover:bg-muted/40">
                      <td className="px-4 py-2">
                        <Link to="/invoices/$id" params={{ id: inv.id }} className="font-medium text-primary hover:underline">
                          {inv.invoice_number}
                        </Link>
                      </td>
                      <td className="px-4 py-2">{formatDate(inv.issue_date)}</td>
                      <td className="px-4 py-2 text-right">{formatINR(inv.total)}</td>
                      <td className="px-4 py-2"><Badge className={statusColors[inv.status] ?? ""}>{inv.status}</Badge></td>
                      <td className="px-4 py-2 text-right">{formatINR(inv.amount_paid)}</td>
                      <td className="px-4 py-2 text-right">{formatINR(Math.max(0, expected - Number(inv.amount_paid)))}</td>
                      <td className="px-4 py-2 text-muted-foreground">{inv.notes || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Total invoices" value={String(totals.count)} />
        <Stat label="Total invoice value" value={formatINR(totals.value)} />
        <Stat label="Total paid" value={formatINR(totals.paid)} />
        <Stat label="Total outstanding" value={formatINR(totals.outstanding)} />
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
