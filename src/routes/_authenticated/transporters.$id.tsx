import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { InvoiceListSection } from "@/components/invoice-list";

export const Route = createFileRoute("/_authenticated/transporters/$id")({
  component: TransporterDetail,
});

function TransporterDetail() {
  const { id } = useParams({ from: "/_authenticated/transporters/$id" });
  const { data: party } = useQuery({
    queryKey: ["transporters", id],
    queryFn: async () => (await (supabase as any).from("transporters").select("*").eq("id", id).maybeSingle()).data as any,
    enabled: !!id,
  });
  if (!party) return <div className="p-6 text-muted-foreground">Loading…</div>;
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/transporters"><Button size="icon" variant="ghost"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{party.nickname || party.name}</h1>
          <p className="text-sm text-muted-foreground">Transporter · Prefix {party.invoice_prefix}</p>
        </div>
      </div>
      <InvoiceListSection module="transporter" newInvoiceHref="/invoices/new" />
    </div>
  );
}
