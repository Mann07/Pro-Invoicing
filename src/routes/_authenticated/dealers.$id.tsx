import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { InvoiceListSection } from "@/components/invoice-list";
import type { ModuleId } from "@/lib/modules";

function makeDetail(kind: ModuleId, table: string, backTo: string, backLabel: string) {
  return function PartyDetail() {
    const { id } = useParams();
    const { data: party } = useQuery({
      queryKey: [table, id],
      queryFn: async () => (await (supabase as any).from(table).select("*").eq("id", id).maybeSingle()).data,
      enabled: !!id,
    });
    if (!party) return <div className="p-6 text-muted-foreground">Loading…</div>;
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link to={backTo}><Button size="icon" variant="ghost"><ArrowLeft className="h-4 w-4" /></Button></Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{party.nickname || party.name}</h1>
            <p className="text-sm text-muted-foreground">{backLabel} · Prefix {party.invoice_prefix}</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <InfoCard title="Contact">
            <div className="font-medium">{party.name}</div>
            {party.contact_person && <div className="text-sm text-muted-foreground">{party.contact_person}</div>}
            {party.mobile && <div className="text-sm text-muted-foreground">{party.mobile}</div>}
            {party.email && <div className="text-sm text-muted-foreground">{party.email}</div>}
          </InfoCard>
          <InfoCard title="Tax & Address">
            {party.gstin && <div className="text-sm">GSTIN: {party.gstin}</div>}
            {party.address && <div className="mt-1 text-sm text-muted-foreground whitespace-pre-line">{party.address}</div>}
          </InfoCard>
          <InfoCard title="Defaults">
            <div className="text-sm text-muted-foreground">GST: {party.default_gst_rate ?? "—"}%</div>
            <div className="text-sm text-muted-foreground">HSN/SAC: {party.default_hsn_sac ?? "—"}</div>
            <div className="text-sm text-muted-foreground">Rate: {party.default_rate ?? "—"}</div>
          </InfoCard>
        </div>

        <InvoiceListSection module={kind} dealerId={kind === "dealer" ? id : undefined} newInvoiceHref="/invoices/new" />
      </div>
    );
  };

  function useParams() {
    // hack: TanStack Route.useParams is only available inside the route file at build time;
    // this helper file is used from route wrappers below where useParams is imported.
    throw new Error("useParams accessed outside route");
  }
}

export { makeDetail };

/* Route file for /_authenticated/dealers/$id — this file also registers the route */
import { useParams as tsrUseParams } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/dealers/$id")({
  component: DealerDetail,
});

function DealerDetail() {
  const { id } = tsrUseParams({ from: "/_authenticated/dealers/$id" });
  const { data: party } = useQuery({
    queryKey: ["dealers", id],
    queryFn: async () => (await (supabase as any).from("dealers").select("*").eq("id", id).maybeSingle()).data,
    enabled: !!id,
  });
  if (!party) return <div className="p-6 text-muted-foreground">Loading…</div>;
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/dealers"><Button size="icon" variant="ghost"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{party.nickname || party.name}</h1>
          <p className="text-sm text-muted-foreground">Dealer · Prefix {party.invoice_prefix}</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <InfoCard title="Contact">
          <div className="font-medium">{party.name}</div>
          {party.contact_person && <div className="text-sm text-muted-foreground">{party.contact_person}</div>}
          {party.mobile && <div className="text-sm text-muted-foreground">{party.mobile}</div>}
          {party.email && <div className="text-sm text-muted-foreground">{party.email}</div>}
        </InfoCard>
        <InfoCard title="Tax & Address">
          {party.gstin && <div className="text-sm">GSTIN: {party.gstin}</div>}
          {party.address && <div className="mt-1 text-sm text-muted-foreground whitespace-pre-line">{party.address}</div>}
        </InfoCard>
        <InfoCard title="Defaults">
          <div className="text-sm text-muted-foreground">GST: {party.default_gst_rate ?? "—"}%</div>
          <div className="text-sm text-muted-foreground">HSN/SAC: {party.default_hsn_sac ?? "—"}</div>
          <div className="text-sm text-muted-foreground">Rate: {party.default_rate ?? "—"}</div>
        </InfoCard>
      </div>

      <InvoiceListSection module="dealer" dealerId={id} newInvoiceHref="/invoices/new" />
    </div>
  );
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="text-xs uppercase text-muted-foreground">{title}</div>
      <div className="mt-2">{children}</div>
    </div>
  );
}
