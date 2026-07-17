import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { Download, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { formatINR, formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/reports")({
  component: ReportsPage,
});

function ReportsPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data = [] } = useQuery({
    queryKey: ["invoices-report"],
    queryFn: async () => {
      const { data } = await supabase.from("invoices").select("*, dealers(name, gstin), customers(name, vehicle_reg)").order("issue_date", { ascending: false });
      return data ?? [];
    },
  });

  const filtered = data.filter((inv: any) => {
    if (from && inv.issue_date < from) return false;
    if (to && inv.issue_date > to) return false;
    return true;
  });

  function exportInvoices() {
    const rows = filtered.map((inv: any) => ({
      "Invoice #": inv.invoice_number,
      "Date": formatDate(inv.issue_date),
      "Dealer": inv.dealers?.name ?? "",
      "Dealer GSTIN": inv.dealers?.gstin ?? "",
      "Customer": inv.customers?.name ?? "",
      "Vehicle": inv.customers?.vehicle_reg ?? "",
      "Subtotal": Number(inv.subtotal),
      "GST %": Number(inv.gst_rate),
      "GST Amount": Number(inv.gst_amount),
      "Total": Number(inv.total),
      "Paid": Number(inv.amount_paid),
      "Outstanding": Number(inv.total) - Number(inv.amount_paid),
      "Status": inv.status,
      "Payment Date": inv.payment_date ? formatDate(inv.payment_date) : "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Invoices");
    XLSX.writeFile(wb, `invoices-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  function exportPayments() {
    const rows = filtered.filter((i: any) => Number(i.amount_paid) > 0).map((inv: any) => ({
      "Invoice #": inv.invoice_number,
      "Date": formatDate(inv.issue_date),
      "Dealer": inv.dealers?.name ?? "",
      "Customer": inv.customers?.name ?? "",
      "Total": Number(inv.total),
      "Paid": Number(inv.amount_paid),
      "Outstanding": Number(inv.total) - Number(inv.amount_paid),
      "Payment Date": inv.payment_date ? formatDate(inv.payment_date) : "",
      "Status": inv.status,
      "Notes": inv.payment_notes ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Payments");
    XLSX.writeFile(wb, `payments-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  const summary = {
    count: filtered.length,
    total: filtered.reduce((s: number, i: any) => s + Number(i.total), 0),
    paid: filtered.reduce((s: number, i: any) => s + Number(i.amount_paid), 0),
    outstanding: filtered.reduce((s: number, i: any) => s + Number(i.total) - Number(i.amount_paid), 0),
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground">Filter and export invoice and payment data to Excel.</p>
      </div>

      <div className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-4">
        <div className="space-y-1"><Label>From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="space-y-1"><Label>To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <div className="flex items-end gap-2 md:col-span-2">
          <Button onClick={exportInvoices}><FileSpreadsheet className="mr-2 h-4 w-4" /> Export Invoices</Button>
          <Button onClick={exportPayments} variant="outline"><Download className="mr-2 h-4 w-4" /> Export Payments</Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Stat label="Invoices" value={String(summary.count)} />
        <Stat label="Total" value={formatINR(summary.total)} />
        <Stat label="Collected" value={formatINR(summary.paid)} />
        <Stat label="Outstanding" value={formatINR(summary.outstanding)} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}
