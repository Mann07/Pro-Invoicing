import { renderAsync } from "docx-preview";

/**
 * Render a DOCX Blob inside a hidden iframe and trigger the browser's
 * native print dialog. The user selects "Save as PDF" as the destination —
 * no server, no third-party service, no installs.
 */
export async function printDocxAsPdf(docx: Blob, filename: string) {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument!;
  doc.open();
  doc.write(`<!doctype html><html><head><title>${escapeHtml(filename)}</title>
<style>
  @page { margin: 12mm; }
  html, body { margin: 0; padding: 0; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .docx-wrapper { background: #fff !important; padding: 0 !important; }
  .docx-wrapper > section.docx { box-shadow: none !important; margin: 0 auto !important; }
</style></head><body><div id="container"></div></body></html>`);
  doc.close();

  const container = doc.getElementById("container")!;
  await renderAsync(docx, container, undefined, {
    className: "docx",
    inWrapper: true,
    ignoreWidth: false,
    ignoreHeight: false,
    ignoreFonts: false,
    breakPages: true,
    experimental: true,
    useBase64URL: true,
  });

  // Give the browser a moment to layout images/fonts before printing.
  await new Promise((r) => setTimeout(r, 400));

  iframe.contentWindow!.focus();
  iframe.contentWindow!.print();

  // Clean up after the print dialog closes (best effort).
  setTimeout(() => iframe.remove(), 60_000);
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
