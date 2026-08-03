import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";

export type PartyKind = "dealer" | "vendor" | "transporter";

export const PARTY_TABLE: Record<PartyKind, "dealers" | "vendors" | "transporters"> = {
  dealer: "dealers",
  vendor: "vendors",
  transporter: "transporters",
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
  is_active?: boolean | null;
  default_gst_rate?: number | null;
  default_hsn_sac?: string | null;
  default_description?: string | null;
  default_rate?: number | null;
};

export function PartyFormDialog({
  kind,
  open,
  onOpenChange,
  party,
  onSaved,
}: {
  kind: PartyKind;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  party: Party | null;
  onSaved?: () => void;
}) {
  const qc = useQueryClient();
  const table = PARTY_TABLE[kind];
  const [editing, setEditing] = useState<Party | null>(party);
  const [saving, setSaving] = useState(false);

  // Sync when a different record is opened
  const [seed, setSeed] = useState(party);
  if (seed !== party) {
    setSeed(party);
    setEditing(party);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    if (!editing.invoice_prefix?.trim()) return toast.error("Invoice prefix is required");
    setSaving(true);
    const payload: any = { ...editing, invoice_prefix: editing.invoice_prefix.trim().toUpperCase() };
    delete payload.id;
    const res = editing.id
      ? await (supabase as any).from(table).update(payload).eq("id", editing.id)
      : await (supabase as any).from(table).insert(payload);
    setSaving(false);
    if (res.error) return toast.error(res.error.message);
    toast.success("Saved");
    onOpenChange(false);
    qc.invalidateQueries({ queryKey: [table] });
    if (editing.id) qc.invalidateQueries({ queryKey: [table, editing.id] });
    onSaved?.();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editing?.id ? "Edit" : "New"} {kind}</DialogTitle></DialogHeader>
        {editing && (
          <form onSubmit={save} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nickname (internal)">
                <Input value={editing.nickname ?? ""} onChange={(e) => setEditing({ ...editing, nickname: e.target.value })} />
              </Field>
              <Field label="Invoice prefix *">
                <Input required value={editing.invoice_prefix}
                  onChange={(e) => setEditing({ ...editing, invoice_prefix: e.target.value.toUpperCase() })} />
              </Field>
            </div>
            <Field label="Name *">
              <Input required value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Contact person">
                <Input value={editing.contact_person ?? ""} onChange={(e) => setEditing({ ...editing, contact_person: e.target.value })} />
              </Field>
              <Field label="GST number">
                <Input value={editing.gstin ?? ""} onChange={(e) => setEditing({ ...editing, gstin: e.target.value })} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Mobile">
                <Input value={editing.mobile ?? ""} onChange={(e) => setEditing({ ...editing, mobile: e.target.value })} />
              </Field>
              <Field label="Email">
                <Input type="email" value={editing.email ?? ""} onChange={(e) => setEditing({ ...editing, email: e.target.value })} />
              </Field>
            </div>
            <Field label="Address">
              <Textarea rows={2} value={editing.address ?? ""} onChange={(e) => setEditing({ ...editing, address: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Default GST %">
                <Input type="number" step="0.01" value={editing.default_gst_rate ?? ""} onChange={(e) => setEditing({ ...editing, default_gst_rate: e.target.value === "" ? null : Number(e.target.value) })} />
              </Field>
              <Field label="Default HSN/SAC">
                <Input value={editing.default_hsn_sac ?? ""} onChange={(e) => setEditing({ ...editing, default_hsn_sac: e.target.value })} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Default description">
                <Input value={editing.default_description ?? ""} onChange={(e) => setEditing({ ...editing, default_description: e.target.value })} />
              </Field>
              <Field label="Default rate">
                <Input type="number" step="0.01" value={editing.default_rate ?? ""} onChange={(e) => setEditing({ ...editing, default_rate: e.target.value === "" ? null : Number(e.target.value) })} />
              </Field>
            </div>
            <Field label="Notes">
              <Textarea rows={2} value={editing.notes ?? ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
            </Field>
            <div className="flex items-center gap-3">
              <input
                id="party-active"
                type="checkbox"
                className="h-4 w-4"
                checked={editing.is_active !== false}
                onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })}
              />
              <Label htmlFor="party-active">Active</Label>
            </div>
            <DialogFooter><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</Button></DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label>{label}</Label>{children}</div>;
}
