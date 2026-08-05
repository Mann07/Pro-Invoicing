import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { FileText, Users, Package, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  const { session, loading } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && session) navigate({ to: "/dashboard" });
  }, [loading, session, navigate]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2 font-semibold tracking-tight">
            <FileText className="h-5 w-5 text-accent" />
            Pro Invoicing
          </div>
          <Link to="/auth">
            <Button size="sm" variant="secondary">Sign in</Button>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-16 md:py-24">
        <div className="max-w-3xl">
          <span className="inline-block rounded-full bg-accent/20 px-3 py-1 text-xs font-medium text-accent-foreground">
            Dealer & Vendor Billing
          </span>
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-foreground md:text-6xl">
            Invoicing built for dealer billing.
          </h1>
          <p className="mt-4 text-lg text-muted-foreground md:text-xl">
            Generate GST-ready invoices from your own Word template with HSN/SAC
            codes, dealer-scoped numbering, and amount in words.
          </p>
          <div className="mt-8 flex gap-3">
            <Link to="/auth">
              <Button size="lg">Get started</Button>
            </Link>
          </div>
        </div>

        <div className="mt-16 grid gap-4 md:grid-cols-4">
          {[
            { icon: FileText, title: "Word template", body: "Upload your .docx template; invoices are rendered with your formatting." },
            { icon: Users, title: "Dealers & vendors", body: "Bill dealers or vendors with separate formats, prefixes, and nicknames." },
            { icon: Package, title: "Payment tracking", body: "Mark Paid, Partial, or Unpaid with outstanding balance." },
            { icon: ShieldCheck, title: "Admin auth", body: "Cloud-hosted with secure signed downloads." },
          ].map((f) => (
            <div key={f.title} className="rounded-lg border bg-card p-5">
              <f.icon className="h-6 w-6 text-accent" />
              <h3 className="mt-3 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
