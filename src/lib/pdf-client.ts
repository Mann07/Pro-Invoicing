import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatINR, formatDate } from "./format";

export async function generateInvoicePdf(inv: any) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header
  doc.setFillColor(40, 45, 80);
  doc.rect(0, 0, pageWidth, 30, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.text("INVOICE", 14, 20);
  doc.setFontSize(12);
  doc.text(inv.invoice_number, pageWidth - 14, 20, { align: "right" });

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);
  doc.text(`Date: ${formatDate(inv.issue_date)}`, pageWidth - 14, 38, { align: "right" });
  doc.text(`Status: ${inv.status.toUpperCase()}`, pageWidth - 14, 44, { align: "right" });

  // Dealer & Customer
  let y = 42;
  doc.setFont("helvetica", "bold");
  doc.text("From (Dealer):", 14, y);
  doc.setFont("helvetica", "normal");
  y += 5;
  if (inv.dealers) {
    doc.text(inv.dealers.name, 14, y); y += 5;
    if (inv.dealers.gstin) { doc.text(`GSTIN: ${inv.dealers.gstin}`, 14, y); y += 5; }
    if (inv.dealers.address) { doc.text(doc.splitTextToSize(inv.dealers.address, 80), 14, y); y += 5; }
    if (inv.dealers.phone) { doc.text(inv.dealers.phone, 14, y); y += 5; }
  }

  let y2 = 42;
  doc.setFont("helvetica", "bold");
  doc.text("Bill To (Customer):", pageWidth / 2 + 10, y2);
  doc.setFont("helvetica", "normal");
  y2 += 5;
  if (inv.customers) {
    doc.text(inv.customers.name, pageWidth / 2 + 10, y2); y2 += 5;
    if (inv.customers.vehicle_reg)
      { doc.text(`Vehicle: ${inv.customers.vehicle_reg} ${inv.customers.vehicle_make_model ?? ""}`, pageWidth / 2 + 10, y2); y2 += 5; }
    if (inv.customers.phone) { doc.text(inv.customers.phone, pageWidth / 2 + 10, y2); y2 += 5; }
    if (inv.customers.address) { doc.text(doc.splitTextToSize(inv.customers.address, 80), pageWidth / 2 + 10, y2); y2 += 5; }
  }

  const startY = Math.max(y, y2) + 6;

  // Items
  autoTable(doc, {
    startY,
    head: [["#", "Description", "Qty", "Rate", "Amount"]],
    body: (inv.line_items as any[]).map((it, i) => [
      String(i + 1),
      it.description,
      String(it.qty),
      formatINR(it.rate),
      formatINR(it.amount),
    ]),
    headStyles: { fillColor: [40, 45, 80] },
    styles: { fontSize: 9 },
  });

  const finalY = (doc as any).lastAutoTable.finalY + 8;
  const rightX = pageWidth - 14;

  doc.setFontSize(10);
  doc.text(`Subtotal: ${formatINR(inv.subtotal)}`, rightX, finalY, { align: "right" });
  doc.text(`GST @ ${inv.gst_rate}%: ${formatINR(inv.gst_amount)}`, rightX, finalY + 6, { align: "right" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(`Total: ${formatINR(inv.total)}`, rightX, finalY + 14, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Paid: ${formatINR(inv.amount_paid)}`, rightX, finalY + 22, { align: "right" });
  doc.text(`Outstanding: ${formatINR(Number(inv.total) - Number(inv.amount_paid))}`, rightX, finalY + 28, { align: "right" });

  if (inv.notes) {
    doc.text("Notes:", 14, finalY + 22);
    doc.text(doc.splitTextToSize(inv.notes, pageWidth - 100), 14, finalY + 28);
  }

  doc.save(`${inv.invoice_number}.pdf`);
}
