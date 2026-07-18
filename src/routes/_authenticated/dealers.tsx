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

export const Route = createFileRoute("/_authenticated/dealers")({
  component: DealersPage,
});

type Dealer = {
  id?: string;
  name: string;
  nickname?: string | null;
  invoice_name?: string | null;
  invoice_prefix: string;
  contact_person?: string | null;
  gstin?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  state_code?: string | null;
  notes?: string | null;
};

function DealersPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Dealer | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ["dealers"],
    queryFn: async () => (await supabase.from("dealers").select("*").order("name")).data ?? [],
  });

  const filtered = data.filter((d: any) =>
    !q || (d.name + " " + (d.nickname ?? "") + " " + (d.invoice_prefix ?? "") + " " + (d.gstin ?? "") + " " + (d.phone ?? ""))
      .toLowerCase().includes(q.toLowerCase())
  );

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    if (!editing.invoice_prefix?.trim()) return toast.error("Invoice prefix is required");
    const payload: any = { ...editing, invoice_prefix: editing.invoice_prefix.trim().toUpperCase() };
    delete payload.id;
    const res = editing.id
      ? await supabase.from("dealers").update(payload).eq("id", editing.id)
      : await supabase.from("dealers").insert(payload);
    if (res.error) return toast.error(res.error.message);
    toast.success("Saved");
    setOpen(false); setEditing(null);
    qc.invalidateQueries({ queryKey: ["dealers"] });
  }

  async function remove(id: string) {
    if (!confirm("Delete dealer?")) return;
    const { error } = await supabase.from("dealers").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["dealers"] });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dealers</h1>
          <p className="text-sm text-muted-foreground">Manage dealers, internal nicknames, and invoice number prefixes.</p>
        </div>
        <Button onClick={() => { setEditing({ name: "", invoice_prefix: "" }); setOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" /> New Dealer
        </Button>
      </div>

      <Input placeholder="Search dealers…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-md" />

      <div className="overflow-hidden rounded-lg border bg-card">
        {isLoading ? <div className="p-6 text-muted-foreground">Loading…</div> :
          filtered.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">No dealers yet.</div> :
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Nickname</th>
                <th className="px-4 py-2">Invoice name</th>
                <th className="px-4 py-2">Prefix</th>
                <th className="px-4 py-2">GSTIN</th>
                <th className="px-4 py-2">Phone</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((d: any) => (
                <tr key={d.id}>
                  <td className="px-4 py-2 font-medium">{d.nickname ?? d.name}</td>
                  <td className="px-4 py-2">{d.invoice_name ?? d.name}</td>
                  <td className="px-4 py-2 font-mono text-xs">{d.invoice_prefix}</td>
                  <td className="px-4 py-2">{d.gstin ?? "—"}</td>
                  <td className="px-4 py-2">{d.phone ?? "—"}</td>
                  <td className="px-4 py-2 text-right">
                    <Button size="icon" variant="ghost" onClick={() => { setEditing(d); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => remove(d.id)}><Trash2 className="h-4 w-4" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        }
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing?.id ? "Edit dealer" : "New dealer"}</DialogTitle></DialogHeader>
          {editing && (
            <form onSubmit={save} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nickname (internal)">
                  <Input placeholder="e.g. EMI Bombay"
                    value={editing.nickname ?? ""}
                    onChange={(e) => setEditing({ ...editing!, nickname: e.target.value })} />
                </Field>
                <Field label="Invoice prefix *">
                  <Input required placeholder="e.g. EMIBM-"
                    value={editing.invoice_prefix}
                    onChange={(e) => setEditing({ ...editing!, invoice_prefix: e.target.value.toUpperCase() })} />
                </Field>
              </div>
              <Field label="Name *">
                <Input required value={editing.name}
                  onChange={(e) => setEditing({ ...editing!, name: e.target.value })} />
              </Field>
              <Field label="Invoice name (shown on invoice)">
                <Input placeholder="Legal / display name on invoice"
                  value={editing.invoice_name ?? ""}
                  onChange={(e) => setEditing({ ...editing!, invoice_name: e.target.value })} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Contact person">
                  <Input value={editing.contact_person ?? ""}
                    onChange={(e) => setEditing({ ...editing!, contact_person: e.target.value })} />
                </Field>
                <Field label="GSTIN">
                  <Input value={editing.gstin ?? ""}
                    onChange={(e) => setEditing({ ...editing!, gstin: e.target.value })} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Phone">
                  <Input value={editing.phone ?? ""}
                    onChange={(e) => setEditing({ ...editing!, phone: e.target.value })} />
                </Field>
                <Field label="State code">
                  <Input value={editing.state_code ?? ""}
                    onChange={(e) => setEditing({ ...editing!, state_code: e.target.value })} />
                </Field>
              </div>
              <Field label="Email">
                <Input type="email" value={editing.email ?? ""}
                  onChange={(e) => setEditing({ ...editing!, email: e.target.value })} />
              </Field>
              <Field label="Address">
                <Textarea rows={2} value={editing.address ?? ""}
                  onChange={(e) => setEditing({ ...editing!, address: e.target.value })} />
              </Field>
              <Field label="Internal notes">
                <Textarea rows={2} value={editing.notes ?? ""}
                  onChange={(e) => setEditing({ ...editing!, notes: e.target.value })} />
              </Field>
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
