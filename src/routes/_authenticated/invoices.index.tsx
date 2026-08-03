import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { InvoiceListSection } from "@/components/invoice-list";
import { MODULES } from "@/lib/modules";

export const Route = createFileRoute("/_authenticated/invoices/")({
  component: InvoicesIndex,
});

function InvoicesIndex() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Invoices</h1>
          <p className="text-sm text-muted-foreground">All invoices, grouped by module.</p>
        </div>
        <Link to="/invoices/new"><Button><Plus className="mr-2 h-4 w-4" /> New Invoice</Button></Link>
      </div>

      <Tabs defaultValue="dealer">
        <TabsList>
          {MODULES.map((m) => <TabsTrigger key={m.id} value={m.id}>{m.label}</TabsTrigger>)}
        </TabsList>
        {MODULES.map((m) => (
          <TabsContent key={m.id} value={m.id}>
            <InvoiceListSection module={m.id} showHeader={false} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
