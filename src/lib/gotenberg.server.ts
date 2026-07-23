/**
 * Convert a DOCX buffer to PDF via a self-hosted Gotenberg instance.
 * Config: GOTENBERG_URL (required), GOTENBERG_AUTH (optional).
 * Endpoint used: /forms/libreoffice/convert
 */
export async function convertDocxToPdf(docx: Uint8Array | ArrayBuffer, filename = "invoice.docx"): Promise<Uint8Array> {
  const base = process.env.GOTENBERG_URL;
  if (!base) throw new Error("GOTENBERG_URL is not configured");
  const auth = process.env.GOTENBERG_AUTH || "";

  const bytes = docx instanceof Uint8Array ? docx : new Uint8Array(docx);
  const form = new FormData();
  const blob = new Blob([bytes as unknown as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  form.append("files", blob, filename);
  // Ensure no header/footer/page numbers appear via Gotenberg's own chrome.
  form.append("pdfa", "");

  const headers: Record<string, string> = {};
  if (auth) headers["Authorization"] = auth;

  const res = await fetch(`${base.replace(/\/$/, "")}/forms/libreoffice/convert`, {
    method: "POST",
    headers,
    body: form,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gotenberg convert failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const buf = new Uint8Array(await res.arrayBuffer());
  return buf;
}
