import { createFileRoute, Outlet, redirect, Link, useNavigate, useLocation } from "@tanstack/react-router";
import { useState } from "react";
import {
  LayoutDashboard, FileText, Users, Car, FileCog, BarChart3, LogOut, Menu, X, PlusCircle, Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthLayout,
});

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/invoices/new", label: "New Invoice", icon: PlusCircle },
  { to: "/dealers", label: "Dealers", icon: Users },
  { to: "/customers", label: "Vendors", icon: Car },
  { to: "/templates", label: "Templates", icon: FileCog },
  { to: "/reports", label: "Reports", icon: BarChart3 },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

function AuthLayout() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const location = useLocation();

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar (desktop) */}
      <aside className="hidden w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">
        <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-5 font-semibold">
          <FileText className="h-5 w-5 text-sidebar-primary" />
          Dealer Invoicing
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {nav.map((item) => {
            const active = location.pathname.startsWith(item.to);
            return (
              <Link key={item.to} to={item.to}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
                    : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}>
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-sidebar-border p-3">
          <Button variant="ghost" size="sm" onClick={signOut}
            className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
            <LogOut className="mr-2 h-4 w-4" /> Sign out
          </Button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b bg-primary px-4 text-primary-foreground md:hidden">
          <Link to="/dashboard" className="inline-flex items-center gap-2 font-semibold">
            <FileText className="h-5 w-5 text-accent" /> Dealer Invoicing
          </Link>
          <Button size="icon" variant="ghost" onClick={() => setOpen(!open)}
            className="text-primary-foreground hover:bg-white/10">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </header>
        {open && (
          <div className="border-b bg-sidebar text-sidebar-foreground md:hidden">
            <nav className="space-y-1 p-3">
              {nav.map((item) => (
                <Link key={item.to} to={item.to} onClick={() => setOpen(false)}
                  className="flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-sidebar-accent">
                  <item.icon className="h-4 w-4" /> {item.label}
                </Link>
              ))}
              <button onClick={signOut}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-sidebar-accent">
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </nav>
          </div>
        )}
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
