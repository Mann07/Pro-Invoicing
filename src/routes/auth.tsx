import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { session } = useSession();
  useEffect(() => {
    if (session) navigate({ to: "/dashboard" });
  }, [session, navigate]);

  const [signIn, setSignIn] = useState({ email: "", password: "" });
  const [signUp, setSignUp] = useState({ email: "", password: "", full_name: "" });
  const [busy, setBusy] = useState(false);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword(signIn);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Welcome back");
    navigate({ to: "/dashboard" });
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email: signUp.email,
      password: signUp.password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: signUp.full_name },
      },
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Account created");
    navigate({ to: "/dashboard" });
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="border-b bg-primary text-primary-foreground">
        <div className="mx-auto max-w-6xl px-4 py-4">
          <Link to="/" className="inline-flex items-center gap-2 font-semibold">
            <FileText className="h-5 w-5 text-accent" /> RTO Invoice Manager
          </Link>
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-sm">
          <h1 className="text-2xl font-bold tracking-tight">Admin access</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            First user becomes admin automatically.
          </p>
          <Tabs defaultValue="signin" className="mt-6">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Sign up</TabsTrigger>
            </TabsList>
            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="in-email">Email</Label>
                  <Input id="in-email" type="email" required
                    value={signIn.email}
                    onChange={(e) => setSignIn({ ...signIn, email: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="in-pw">Password</Label>
                  <Input id="in-pw" type="password" required
                    value={signIn.password}
                    onChange={(e) => setSignIn({ ...signIn, password: e.target.value })} />
                </div>
                <Button className="w-full" disabled={busy}>Sign in</Button>
              </form>
            </TabsContent>
            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="up-name">Full name</Label>
                  <Input id="up-name" required
                    value={signUp.full_name}
                    onChange={(e) => setSignUp({ ...signUp, full_name: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="up-email">Email</Label>
                  <Input id="up-email" type="email" required
                    value={signUp.email}
                    onChange={(e) => setSignUp({ ...signUp, email: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="up-pw">Password</Label>
                  <Input id="up-pw" type="password" required minLength={8}
                    value={signUp.password}
                    onChange={(e) => setSignUp({ ...signUp, password: e.target.value })} />
                </div>
                <Button className="w-full" disabled={busy}>Create account</Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
