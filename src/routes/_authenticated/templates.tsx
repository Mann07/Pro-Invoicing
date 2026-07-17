import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Upload, Check, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/templates")({
  component: TemplatesPage,
});

function TemplatesPage() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const { data = [] } = useQuery({
    queryKey: ["templates"],
    queryFn: async () => (await supabase.from("invoice_templates").select("*").order("created_at", { ascending: false })).data ?? [],
  });

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !name) return toast.error("Provide a name and a .docx file");
    if (!file.name.endsWith(".docx")) return toast.error("Must be a .docx file");
    setBusy(true);
    try {
      const path = `templates/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("invoice-templates").upload(path, file, {
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      if (upErr) throw upErr;
      const { data: user } = await supabase.auth.getUser();
      const { error: insErr } = await supabase.from("invoice_templates").insert({
        name, storage_path: path, uploaded_by: user.user?.id, is_active: data.length === 0,
      });
      if (insErr) throw insErr;
      toast.success("Template uploaded");
      setName(""); setFile(null);
      qc.invalidateQueries({ queryKey: ["templates"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally { setBusy(false); }
  }

  async function makeActive(id: string) {
    await supabase.from("invoice_templates").update({ is_active: false }).neq("id", id);
    const { error } = await supabase.from("invoice_templates").update({ is_active: true }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Active template updated");
    qc.invalidateQueries({ queryKey: ["templates"] });
  }

  async function remove(id: string, path: string) {
    if (!confirm("Delete template?")) return;
    await supabase.storage.from("invoice-templates").remove([path]);
    const { error } = await supabase.from("invoice_templates").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["templates"] });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Invoice Templates</h1>
        <p className="text-sm text-muted-foreground">
          Upload a Microsoft Word (.docx) template. Only admins can manage templates.
        </p>
      </div>

      <div className="rounded-lg border bg-card p-5">
        <h2 className="font-semibold">Placeholder reference</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Use these placeholders in your Word document (docxtemplater syntax):
        </p>
        <div className="mt-3 grid gap-2 text-xs font-mono md:grid-cols-2">
          {[
            "{invoice_number}", "{issue_date}",
            "{dealer_name}", "{dealer_gstin}", "{dealer_address}", "{dealer_phone}", "{dealer_email}",
            "{customer_name}", "{customer_address}", "{customer_phone}",
            "{vehicle_reg}", "{vehicle_make_model}",
            "{subtotal}", "{gst_rate}", "{gst_amount}", "{total}", "{notes}",
          ].map((p) => <code key={p} className="rounded bg-muted px-2 py-1">{p}</code>)}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Loop over items in a table row using{" "}
          <code className="rounded bg-muted px-1">{"{#items}"}</code> …{" "}
          <code className="rounded bg-muted px-1">{"{sr} {description} {qty} {rate} {amount}"}</code> …{" "}
          <code className="rounded bg-muted px-1">{"{/items}"}</code>
        </p>
      </div>

      <form onSubmit={upload} className="rounded-lg border bg-card p-5">
        <h2 className="font-semibold">Upload new template</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <Input placeholder="Template name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input type="file" accept=".docx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="md:col-span-2" />
        </div>
        <div className="mt-3">
          <Button type="submit" disabled={busy}><Upload className="mr-2 h-4 w-4" /> Upload</Button>
        </div>
      </form>

      <div className="overflow-hidden rounded-lg border bg-card">
        {data.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">No templates uploaded.</div> :
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
              <tr><th className="px-4 py-2">Name</th><th className="px-4 py-2">Uploaded</th><th className="px-4 py-2">Status</th><th className="px-4 py-2"></th></tr>
            </thead>
            <tbody className="divide-y">
              {data.map((t: any) => (
                <tr key={t.id}>
                  <td className="px-4 py-2 font-medium">{t.name}</td>
                  <td className="px-4 py-2">{formatDate(t.created_at)}</td>
                  <td className="px-4 py-2">{t.is_active ? <span className="rounded bg-success px-2 py-0.5 text-xs text-success-foreground">Active</span> : "—"}</td>
                  <td className="px-4 py-2 text-right space-x-1">
                    {!t.is_active && <Button size="sm" variant="outline" onClick={() => makeActive(t.id)}><Check className="mr-1 h-3 w-3" /> Set active</Button>}
                    <Button size="icon" variant="ghost" onClick={() => remove(t.id, t.storage_path)}><Trash2 className="h-4 w-4" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        }
      </div>
    </div>
  );
}
