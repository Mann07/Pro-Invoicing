import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Upload, Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/format";
import { MODULES, type ModuleId } from "@/lib/modules";

export const Route = createFileRoute("/_authenticated/templates")({
  component: TemplatesPage,
});

function TemplatesPage() {
  const qc = useQueryClient();
  const [module, setModule] = useState<ModuleId>("dealer");
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<ModuleId | "all">("all");

  const { data = [] } = useQuery({
    queryKey: ["templates"],
    queryFn: async () =>
      (await (supabase as any).from("invoice_templates").select("*").order("created_at", { ascending: false })).data ?? [],
  });

  const shown = data.filter((t: any) => filter === "all" || t.module === filter);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !name) return toast.error("Provide name, module, and .docx file");
    if (!file.name.endsWith(".docx")) return toast.error("Must be a .docx file");
    setBusy(true);
    try {
      const path = `${module}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("invoice-templates").upload(path, file, {
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      if (upErr) throw upErr;
      const { data: user } = await supabase.auth.getUser();
      const { error: insErr } = await (supabase as any).from("invoice_templates").insert({
        name, module, storage_path: path, uploaded_by: user.user?.id, status: "active",
      });
      if (insErr) throw insErr;
      toast.success("Template uploaded");
      setName(""); setFile(null);
      qc.invalidateQueries({ queryKey: ["templates"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally { setBusy(false); }
  }

  async function toggleStatus(id: string, status: string) {
    const next = status === "active" ? "archived" : "active";
    const { error } = await (supabase as any).from("invoice_templates").update({ status: next }).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["templates"] });
  }

  async function remove(id: string, path: string) {
    // Check if template is used
    const { count } = await (supabase as any).from("invoices").select("id", { count: "exact", head: true }).eq("template_id", id);
    if ((count ?? 0) > 0) return toast.error("Cannot delete — this template is used by existing invoices. Archive it instead.");
    if (!confirm("Delete template?")) return;
    await supabase.storage.from("invoice-templates").remove([path]);
    const { error } = await (supabase as any).from("invoice_templates").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["templates"] });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Invoice Templates</h1>
        <p className="text-sm text-muted-foreground">
          Upload a Word (.docx) template for one specific module. Only templates matching a module appear when creating that module's invoices.
        </p>
      </div>

      <div className="rounded-lg border bg-card p-5">
        <h2 className="font-semibold">Placeholder reference</h2>
        <p className="mt-1 text-sm text-muted-foreground">Use these in the .docx (docxtemplater syntax). Missing values render as blank — never "undefined".</p>
        <div className="mt-3 grid gap-2 text-xs font-mono md:grid-cols-2">
          {["{invoice_number}", "{issue_date}", "{module}",
            "{party_name}", "{party_gstin}", "{party_address}", "{party_contact}", "{party_mobile}", "{party_email}",
            "{customer_name}", "{customer_address}", "{customer_gstin}", "{customer_mobile}", "{customer_email}",
            "{subtotal}", "{gst_rate}", "{gst_amount}", "{total}",
            "{amount_in_words}", "{notes}"].map((p) => <code key={p} className="rounded bg-muted px-2 py-1">{p}</code>)}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Loop items:{" "}
          <code className="rounded bg-muted px-1">{"{#items}"}</code>{" "}
          <code className="rounded bg-muted px-1">{"{sr} {description} {hsn_sac} {qty} {rate} {amount}"}</code>{" "}
          <code className="rounded bg-muted px-1">{"{/items}"}</code>
        </p>
      </div>

      <form onSubmit={upload} className="rounded-lg border bg-card p-5 space-y-3">
        <h2 className="font-semibold">Upload new template</h2>
        <div className="grid gap-3 md:grid-cols-4">
          <div className="space-y-1">
            <Label>Used for</Label>
            <Select value={module} onValueChange={(v) => setModule(v as ModuleId)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MODULES.map((m) => <SelectItem key={m.id} value={m.id}>{m.singular}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>Template name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1 md:col-span-2"><Label>.docx file</Label><Input type="file" accept=".docx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
        </div>
        <Button type="submit" disabled={busy}><Upload className="mr-2 h-4 w-4" /> Upload</Button>
      </form>

      <div className="flex items-center gap-2">
        <Label className="text-sm">Filter:</Label>
        <Select value={filter} onValueChange={(v) => setFilter(v as ModuleId | "all")}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All modules</SelectItem>
            {MODULES.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        {shown.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">No templates.</div> :
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
              <tr><th className="px-4 py-2">Name</th><th className="px-4 py-2">Module</th><th className="px-4 py-2">Uploaded</th><th className="px-4 py-2">Status</th><th className="px-4 py-2"></th></tr>
            </thead>
            <tbody className="divide-y">
              {shown.map((t: any) => (
                <tr key={t.id}>
                  <td className="px-4 py-2 font-medium">{t.name}</td>
                  <td className="px-4 py-2 capitalize">{t.module}</td>
                  <td className="px-4 py-2">{formatDate(t.created_at)}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded px-2 py-0.5 text-xs ${t.status === "active" ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground"}`}>{t.status}</span>
                  </td>
                  <td className="px-4 py-2 text-right space-x-1">
                    <Button size="sm" variant="outline" onClick={() => toggleStatus(t.id, t.status)}>
                      {t.status === "active" ? <><Archive className="mr-1 h-3 w-3" /> Archive</> : <><ArchiveRestore className="mr-1 h-3 w-3" /> Restore</>}
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => remove(t.id, t.storage_path)}><Trash2 className="h-4 w-4" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>}
      </div>
    </div>
  );
}
