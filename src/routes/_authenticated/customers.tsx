import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/customers")({
  component: CustomersPage,
});

type Customer = {
  id?: string;
  name: string; phone?: string | null; address?: string | null;
  vehicle_reg?: string | null; vehicle_make_model?: string | null;
};

function CustomersPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => (await supabase.from("customers").select("*").order("name")).data ?? [],
  });

  const filtered = data.filter((c: any) =>
    !q || (c.name + " " + (c.vehicle_reg ?? "") + " " + (c.phone ?? "")).toLowerCase().includes(q.toLowerCase())
  );

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const payload = { ...editing };
    delete (payload as any).id;
    const res = editing.id
      ? await supabase.from("customers").update(payload).eq("id", editing.id)
      : await supabase.from("customers").insert(payload);
    if (res.error) return toast.error(res.error.message);
    toast.success("Saved");
    setOpen(false); setEditing(null);
    qc.invalidateQueries({ queryKey: ["customers"] });
  }

  async function remove(id: string) {
    if (!confirm("Delete customer?")) return;
    const { error } = await supabase.from("customers").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["customers"] });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Vendors</h1>
          <p className="text-sm text-muted-foreground">Manage vendor records and vehicle details.</p>
        </div>
        <Button onClick={() => { setEditing({ name: "" }); setOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" /> New Vendor
        </Button>
      </div>

      <Input placeholder="Search vendors…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-md" />

      <div className="overflow-hidden rounded-lg border bg-card">
        {isLoading ? <div className="p-6 text-muted-foreground">Loading…</div> :
          filtered.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">No vendors yet.</div> :
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
              <tr><th className="px-4 py-2">Name</th><th className="px-4 py-2">Vehicle</th><th className="px-4 py-2">Make/Model</th><th className="px-4 py-2">Phone</th><th className="px-4 py-2"></th></tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((c: any) => (
                <tr key={c.id}>
                  <td className="px-4 py-2 font-medium">{c.name}</td>
                  <td className="px-4 py-2">{c.vehicle_reg ?? "—"}</td>
                  <td className="px-4 py-2">{c.vehicle_make_model ?? "—"}</td>
                  <td className="px-4 py-2">{c.phone ?? "—"}</td>
                  <td className="px-4 py-2 text-right">
                    <Button size="icon" variant="ghost" onClick={() => { setEditing(c); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => remove(c.id)}><Trash2 className="h-4 w-4" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        }
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing?.id ? "Edit customer" : "New customer"}</DialogTitle></DialogHeader>
          {editing && (
            <form onSubmit={save} className="space-y-3">
              <Field label="Name *"><Input required value={editing.name} onChange={(e) => setEditing({ ...editing!, name: e.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Vehicle reg"><Input value={editing.vehicle_reg ?? ""} onChange={(e) => setEditing({ ...editing!, vehicle_reg: e.target.value })} /></Field>
                <Field label="Make / Model"><Input value={editing.vehicle_make_model ?? ""} onChange={(e) => setEditing({ ...editing!, vehicle_make_model: e.target.value })} /></Field>
              </div>
              <Field label="Phone"><Input value={editing.phone ?? ""} onChange={(e) => setEditing({ ...editing!, phone: e.target.value })} /></Field>
              <Field label="Address"><Textarea rows={2} value={editing.address ?? ""} onChange={(e) => setEditing({ ...editing!, address: e.target.value })} /></Field>
              <DialogFooter><Button type="submit">Save</Button></DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label>{label}</Label>{children}</div>;
}
