import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Plus, User } from "lucide-react";

export const Route = createFileRoute("/_authenticated/customers")({
  component: CustomersPage,
});

function CustomersPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Customers</h1>
        <p className="text-sm text-muted-foreground">
          Customers are one-time. No master is maintained. Create a customer invoice on the fly — the details are captured on the invoice itself.
        </p>
      </div>
      <div className="flex flex-col items-center gap-3 rounded-lg border bg-card p-10 text-center">
        <User className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Ready to bill a one-off customer?</p>
        <Link to="/invoices/new"><Button><Plus className="mr-2 h-4 w-4" /> New Customer Invoice</Button></Link>
      </div>
    </div>
  );
}
