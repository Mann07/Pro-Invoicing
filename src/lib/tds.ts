// Shared GST split + payment/TDS reconciliation helpers.
// Invoice totals are NEVER reduced by TDS — TDS only affects settlement.

export type PaymentLike = { amount: number | string; tds_amount?: number | string | null };

const num = (v: unknown) => {
  const n = typeof v === "string" ? parseFloat(v) : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** Intra-state split: GST is halved into CGST and SGST (remainder goes to SGST). */
export function gstSplit(gstAmount: number | string | null | undefined) {
  const gst = +num(gstAmount).toFixed(2);
  const cgst = +(gst / 2).toFixed(2);
  const sgst = +(gst - cgst).toFixed(2);
  return { gst, cgst, sgst };
}

export function gstRateSplit(gstRate: number | string | null | undefined) {
  const rate = num(gstRate);
  const half = +(rate / 2).toFixed(2);
  return { rate, cgstRate: half, sgstRate: half };
}

/**
 * Reconcile an invoice against its recorded payments.
 * Actual TDS (recorded on payments) drives reconciliation. Older invoices with
 * no payment-level TDS fall back to the invoice's expected TDS so nothing breaks.
 */
export function reconcile(inv: any, payments?: PaymentLike[] | null) {
  const total = num(inv?.total);
  const expectedTdsRate = num(inv?.tds_rate);
  const expectedTds = num(inv?.tds_amount);
  const list = payments ?? null;

  const received = list ? +list.reduce((s, p) => s + num(p.amount), 0).toFixed(2) : num(inv?.amount_paid);
  const actualTds = list ? +list.reduce((s, p) => s + num(p.tds_amount), 0).toFixed(2) : 0;

  // Legacy fallback: no payment-level TDS recorded → use expected TDS.
  const effectiveTds = actualTds > 0 ? actualTds : expectedTds;
  const settlement = +(received + effectiveTds).toFixed(2);
  const outstanding = Math.max(0, +(total - settlement).toFixed(2));

  let status: "pending" | "partial" | "paid" = "pending";
  if (settlement + 0.01 >= total && total > 0) status = "paid";
  else if (received > 0) status = "partial";

  return {
    total,
    received,
    expectedTds,
    expectedTdsRate,
    expectedPayment: +(total - expectedTds).toFixed(2),
    actualTds,
    effectiveTds,
    tdsDifference: +(actualTds - expectedTds).toFixed(2),
    settlement,
    outstanding,
    status,
  };
}
