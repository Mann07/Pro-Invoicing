import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";

export type PartyKind = "dealer" | "vendor" | "transporter";

const TABLE: Record<PartyKind, "dealers" | "vendors" | "transporters"> = {
  dealer: "dealers", vendor: "vendors", transporter: "transporters",
};

export type Party = {
  id?: string;
  name: string;
  nickname?: string | null;
  invoice_prefix: string;
  gstin?: string | null;
  address?: string | null;
  contact_person?: string | null;
  mobile?: string | null;
  email?: string | null;
  notes?: string | null;
  default_gst_rate?: number | null;
  default_hsn_sac?: string | null;
  default_description?: string | null;
  default_rate?: number | null;
};

export function PartyMasterPage({ kind, title, description, detailRoute }: {
  kind: PartyKind; title: string; description: string; detailRoute: string;
}) {
  const qc = useQueryClient();
  const table = TABLE[kind];
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Party | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: [table],
    queryFn: async () => {
      const { data } = await (supabase as any).from(table).select("*").order("name");
      return (data ?? []) as Party[];
    },
  });

  const filtered = data.filter((d) =>
    !q ||
    [d.name, d.nickname, d.invoice_prefix, d.gstin, d.mobile].filter(Boolean).join(" ").toLowerCase().includes(q.toLowerCase()),
  );

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    if (!editing.invoice_prefix?.trim()) return toast.error("Invoice prefix is required");
    const payload: any = { ...editing, invoice_prefix: editing.invoice_prefix.trim().toUpperCase() };
    delete payload.id;
    const res = editing.id
      ? await (supabase as any).from(table).update(payload).eq("id", editing.id)
      : await (supabase as any).from(table).insert(payload);
    if (res.error) return toast.error(res.error.message);
    toast.success("Saved");
    setOpen(false); setEditing(null);
    qc.invalidateQueries({ queryKey: [table] });
  }

  async function remove(id: string) {
    if (!confirm(`Delete this ${kind}?`)) return;
    const { error } = await (supabase as any).from(table).delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: [table] });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Button onClick={() => { setEditing({ name: "", invoice_prefix: "" }); setOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" /> New
        </Button>
      </div>

      <Input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-md" />

      <div className="overflow-hidden rounded-lg border bg-card">
        {isLoading ? <div className="p-6 text-muted-foreground">Loading…</div> :
          filtered.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">No records yet.</div> :
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Nickname</th>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Prefix</th>
                <th className="px-4 py-2">GST</th>
                <th className="px-4 py-2">Mobile</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((d) => (
                <tr key={d.id}>
                  <td className="px-4 py-2 font-medium">
                    <Link to={detailRoute} params={{ id: d.id! }} className="text-primary hover:underline">
                      {d.nickname || d.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{d.name}</td>
                  <td className="px-4 py-2 font-mono text-xs">{d.invoice_prefix}</td>
                  <td className="px-4 py-2">{d.gstin || "—"}</td>
                  <td className="px-4 py-2">{d.mobile || "—"}</td>
                  <td className="px-4 py-2 text-right">
                    <Button size="icon" variant="ghost" onClick={() => { setEditing(d); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => remove(d.id!)}><Trash2 className="h-4 w-4" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing?.id ? "Edit" : "New"} {kind}</DialogTitle></DialogHeader>
          {editing && (
            <form onSubmit={save} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nickname (internal)">
                  <Input value={editing.nickname ?? ""} onChange={(e) => setEditing({ ...editing!, nickname: e.target.value })} />
                </Field>
                <Field label="Invoice prefix *">
                  <Input required value={editing.invoice_prefix}
                    onChange={(e) => setEditing({ ...editing!, invoice_prefix: e.target.value.toUpperCase() })} />
                </Field>
              </div>
              <Field label="Name *">
                <Input required value={editing.name} onChange={(e) => setEditing({ ...editing!, name: e.target.value })} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Contact person">
                  <Input value={editing.contact_person ?? ""} onChange={(e) => setEditing({ ...editing!, contact_person: e.target.value })} />
                </Field>
                <Field label="GST number">
                  <Input value={editing.gstin ?? ""} onChange={(e) => setEditing({ ...editing!, gstin: e.target.value })} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Mobile">
                  <Input value={editing.mobile ?? ""} onChange={(e) => setEditing({ ...editing!, mobile: e.target.value })} />
                </Field>
                <Field label="Email">
                  <Input type="email" value={editing.email ?? ""} onChange={(e) => setEditing({ ...editing!, email: e.target.value })} />
                </Field>
              </div>
              <Field label="Address">
                <Textarea rows={2} value={editing.address ?? ""} onChange={(e) => setEditing({ ...editing!, address: e.target.value })} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Default GST %">
                  <Input type="number" step="0.01" value={editing.default_gst_rate ?? ""} onChange={(e) => setEditing({ ...editing!, default_gst_rate: e.target.value === "" ? null : Number(e.target.value) })} />
                </Field>
                <Field label="Default HSN/SAC">
                  <Input value={editing.default_hsn_sac ?? ""} onChange={(e) => setEditing({ ...editing!, default_hsn_sac: e.target.value })} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Default description">
                  <Input value={editing.default_description ?? ""} onChange={(e) => setEditing({ ...editing!, default_description: e.target.value })} />
                </Field>
                <Field label="Default rate">
                  <Input type="number" step="0.01" value={editing.default_rate ?? ""} onChange={(e) => setEditing({ ...editing!, default_rate: e.target.value === "" ? null : Number(e.target.value) })} />
                </Field>
              </div>
              <Field label="Notes">
                <Textarea rows={2} value={editing.notes ?? ""} onChange={(e) => setEditing({ ...editing!, notes: e.target.value })} />
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
