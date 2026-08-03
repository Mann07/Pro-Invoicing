import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { PartyFormDialog, PARTY_TABLE, type Party, type PartyKind } from "@/components/party-form-dialog";

export type { Party, PartyKind };

export function PartyMasterPage({ kind, title, description, detailRoute }: {
  kind: PartyKind; title: string; description: string; detailRoute: string;
}) {
  const qc = useQueryClient();
  const table = PARTY_TABLE[kind];
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
        <Button onClick={() => { setEditing({ name: "", invoice_prefix: "", is_active: true }); setOpen(true); }}>
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
                <th className="px-4 py-2">Status</th>
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
                  <td className="px-4 py-2">{d.is_active === false ? "Inactive" : "Active"}</td>
                  <td className="px-4 py-2 text-right">
                    <Button size="icon" variant="ghost" onClick={() => { setEditing(d); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => remove(d.id!)}><Trash2 className="h-4 w-4" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>}
      </div>

      <PartyFormDialog kind={kind} open={open} onOpenChange={setOpen} party={editing} />
    </div>
  );
}
